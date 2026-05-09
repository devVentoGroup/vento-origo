import Link from "next/link";
import { redirect } from "next/navigation";

import { ReceiptForm } from "@/components/vento/receipts/receipt-form";
import { requireAppAccess } from "@/lib/auth/guard";
import { formatPurchaseOrderRef } from "@/lib/purchase-orders/reference";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RECEIPTS_PERMISSION = "procurement.receipts";
const OPERATIONAL_RECEIPT_LOCATION_CODES = [
  "LOC-CP-BOD-MAIN",
  "LOC-CP-N3P-MAIN",
  "LOC-CP-FRIO-MAIN",
  "LOC-CP-CONG-MAIN",
  "LOC-CP-PROD-COC-01",
  "LOC-CP-PROD-PAN-01",
  "LOC-CP-PROD-REP-01",
];

const OPERATIONAL_RECEIPT_LOCATION_ORDER = new Map(
  OPERATIONAL_RECEIPT_LOCATION_CODES.map((code, index) => [code, index])
);

type SearchParams = {
  error?: string;
  ok?: string;
  purchase_order_id?: string;
};

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  cost: number | null;
};

type ProfileRow = {
  product_id: string;
  track_inventory: boolean;
  costing_mode: "auto_primary_supplier" | "manual" | null;
  lot_tracking: boolean;
  expiry_tracking: boolean;
};

type ProductProfileWithProduct = {
  product_id: string;
  lot_tracking?: boolean | null;
  expiry_tracking?: boolean | null;
  products: ProductRow | ProductRow[] | null;
};

type ProductFormRow = ProductRow & {
  lot_tracking: boolean;
  expiry_tracking: boolean;
};

type SupplierRow = {
  id: string;
  name: string | null;
};

type LocationRow = {
  id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

type LocationPositionRow = {
  id: string;
  location_id: string;
  parent_position_id: string | null;
  code: string;
  name: string;
  kind: string;
  sort_order: number | null;
};

type PurchaseOrderRow = {
  id: string;
  supplier_id: string | null;
  site_id: string | null;
  status: string | null;
  created_at: string | null;
  notes: string | null;
  suppliers?: { name?: string | null } | { name?: string | null }[] | null;
};

type PurchaseOrderItemRow = {
  id: string;
  product_id: string;
  quantity_ordered: number | null;
  quantity_received: number | null;
  unit_cost: number | null;
};

type EntryRow = {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  status: string | null;
  received_at: string | null;
  created_at: string | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundQuantity(value: number, decimals = 6): number {
  if (!Number.isFinite(value)) return 0;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function computeWeightedAverageCost(params: {
  currentQty: number;
  currentUnitCost: number;
  receivedQty: number;
  receivedUnitCost: number;
}): number {
  const safeCurrentQty = Math.max(0, Number(params.currentQty || 0));
  const safeCurrentCost = Math.max(0, Number(params.currentUnitCost || 0));
  const safeReceivedQty = Math.max(0, Number(params.receivedQty || 0));
  const safeReceivedCost = Math.max(0, Number(params.receivedUnitCost || 0));

  if (safeReceivedQty <= 0) return roundQuantity(safeCurrentCost, 6);
  const denominator = safeCurrentQty + safeReceivedQty;
  if (denominator <= 0) return roundQuantity(safeReceivedCost, 6);
  return roundQuantity(
    (safeCurrentCost * safeCurrentQty + safeReceivedCost * safeReceivedQty) / denominator,
    6
  );
}

function safeDecode(raw: string | undefined) {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function createReceipt(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect("/login?returnTo=/receipts");
  }

  const siteId = asText(formData.get("site_id"));
  if (!siteId) {
    redirect("/receipts?error=" + encodeURIComponent("No tienes sede activa."));
  }

  const { data: canReceive, error: permErr } = await supabase.rpc("has_permission", {
    p_permission_code: "origo.procurement.receipts",
    p_site_id: siteId,
    p_area_id: null,
  });
  if (permErr || !canReceive) {
    redirect("/receipts?error=" + encodeURIComponent("No tienes permiso para registrar recepciones."));
  }

  const supplierId = asText(formData.get("supplier_id"));
  const invoiceNumber = asText(formData.get("invoice_number"));
  const receivedAt = asText(formData.get("received_at"));
  const notes = asText(formData.get("notes"));
  const purchaseOrderId = asText(formData.get("purchase_order_id")) || null;
  const emergencyReason = asText(formData.get("emergency_reason"));

  const entryMode: "normal" | "emergency" = purchaseOrderId ? "normal" : "emergency";

  if (!supplierId) {
    redirect("/receipts?error=" + encodeURIComponent("Proveedor requerido."));
  }

  if (entryMode === "emergency" && !emergencyReason) {
    redirect(
      "/receipts?error=" +
      encodeURIComponent("Motivo requerido para registrar una recepcion de emergencia.")
    );
  }

  const { data: supplierRow } = await supabase
    .from("suppliers")
    .select("name")
    .eq("id", supplierId)
    .maybeSingle();
  const supplierName = String(supplierRow?.name ?? "").trim();
  if (!supplierName) {
    redirect("/receipts?error=" + encodeURIComponent("Proveedor no valido."));
  }

  const productIds = formData.getAll("item_product_id").map((value) => String(value).trim());
  const locationIds = formData.getAll("item_location_id").map((value) => String(value).trim());
  const quantities = formData
    .getAll("item_quantity_received")
    .map((value) => asNumber(String(value).trim()));
  const unitCosts = formData
    .getAll("item_unit_cost")
    .map((value) => asNumber(String(value).trim()));
  const poItemIds = formData
    .getAll("item_purchase_order_item_id")
    .map((value) => String(value).trim());
  const lineNotes = formData.getAll("item_notes").map((value) => String(value).trim());
  const lotNumbers = formData.getAll("item_lot_number").map((value) => String(value).trim());
  const expiryDates = formData.getAll("item_expiry_date").map((value) => String(value).trim());

  const productLookupIds = Array.from(new Set(productIds.filter(Boolean)));
  const { data: productRowsData } = productLookupIds.length
    ? await supabase
      .from("products")
      .select("id,name,unit,stock_unit_code,cost")
      .in("id", productLookupIds)
    : { data: [] as ProductRow[] };
  const productMap = new Map(((productRowsData ?? []) as ProductRow[]).map((row) => [row.id, row]));

  const { data: profileRowsData } = productLookupIds.length
    ? await supabase
      .from("product_inventory_profiles")
      .select("product_id,track_inventory,costing_mode,lot_tracking,expiry_tracking")
      .in("product_id", productLookupIds)
    : { data: [] as ProfileRow[] };
  const profileMap = new Map(((profileRowsData ?? []) as ProfileRow[]).map((row) => [row.product_id, row]));

  const items = productIds
    .map((productId, index) => {
      if (!productId) return null;
      const quantityReceived = Number(quantities[index] ?? 0);
      if (!Number.isFinite(quantityReceived) || quantityReceived <= 0) return null;

      const product = productMap.get(productId);
      const profile = profileMap.get(productId);
      const stockUnitCode = String(product?.stock_unit_code ?? product?.unit ?? "un").trim().toLowerCase();
      const defaultCost = Number(product?.cost ?? 0);
      const unitCostRaw = Number(unitCosts[index] ?? 0);
      const stockUnitCost = unitCostRaw > 0 ? unitCostRaw : defaultCost;
      const lotNumber = lotNumbers[index] || null;
      const expiryDate = expiryDates[index] || null;

      if (profile?.lot_tracking && !lotNumber) {
        redirect("/receipts?error=" + encodeURIComponent("Hay items que requieren lote."));
      }
      if (profile?.expiry_tracking && !expiryDate) {
        redirect(
          "/receipts?error=" + encodeURIComponent("Hay items que requieren fecha de vencimiento.")
        );
      }

      return {
        product_id: productId,
        location_id: locationIds[index] || "",
        quantity_received: quantityReceived,
        quantity_declared: quantityReceived,
        stock_unit_code: stockUnitCode || "un",
        stock_unit_cost: stockUnitCost > 0 ? stockUnitCost : 0,
        line_total_cost: roundQuantity(quantityReceived * (stockUnitCost > 0 ? stockUnitCost : 0), 6),
        purchase_order_item_id: poItemIds[index] || null,
        cost_source: unitCostRaw > 0 ? "manual" : "fallback_product_cost",
        lot_number: lotNumber,
        expiry_date: expiryDate,
        notes: lineNotes[index] || null,
        apply_auto_cost:
          Boolean(profile?.track_inventory) && profile?.costing_mode === "auto_primary_supplier",
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (!items.length) {
    redirect("/receipts?error=" + encodeURIComponent("Agrega al menos un item con cantidad mayor a 0."));
  }

  if (items.some((item) => !item.location_id)) {
    redirect("/receipts?error=" + encodeURIComponent("Selecciona una LOC para cada item."));
  }

  const status = "received";
  let entryInsert = await supabase
    .from("inventory_entries")
    .insert({
      site_id: siteId,
      supplier_id: supplierId,
      supplier_name: supplierName,
      invoice_number: invoiceNumber || null,
      received_at: receivedAt || null,
      status,
      notes: notes || null,
      created_by: user.id,
      purchase_order_id: purchaseOrderId,
      source_app: "origo",
      entry_mode: entryMode,
      emergency_reason: entryMode === "emergency" ? emergencyReason : null,
    })
    .select("id")
    .single();

  if (entryInsert.error && entryInsert.error.code === "42703") {
    entryInsert = await supabase
      .from("inventory_entries")
      .insert({
        site_id: siteId,
        supplier_id: supplierId,
        supplier_name: supplierName,
        invoice_number: invoiceNumber || null,
        received_at: receivedAt || null,
        status,
        notes:
          entryMode === "emergency"
            ? [notes, `Emergencia: ${emergencyReason}`].filter(Boolean).join(" | ")
            : notes || null,
        created_by: user.id,
        purchase_order_id: purchaseOrderId,
      })
      .select("id")
      .single();
  }

  const { data: entry, error: entryErr } = entryInsert;
  if (entryErr || !entry) {
    redirect("/receipts?error=" + encodeURIComponent(entryErr?.message ?? "No se pudo crear la recepcion."));
  }

  const entryItemRows = items.map((item) => ({
    entry_id: entry.id,
    product_id: item.product_id,
    location_id: item.location_id,
    quantity_declared: item.quantity_declared,
    quantity_received: item.quantity_received,
    unit: item.stock_unit_code,
    input_qty: item.quantity_received,
    input_unit_code: item.stock_unit_code,
    conversion_factor_to_stock: 1,
    stock_unit_code: item.stock_unit_code,
    input_unit_cost: item.stock_unit_cost,
    stock_unit_cost: item.stock_unit_cost,
    line_total_cost: item.line_total_cost,
    cost_source: item.cost_source,
    currency: "COP",
    purchase_order_item_id: item.purchase_order_item_id,
    lot_number: item.lot_number,
    expiry_date: item.expiry_date,
    notes: item.notes,
  }));
  const { error: entryItemsErr } = await supabase.from("inventory_entry_items").insert(entryItemRows);
  if (entryItemsErr) {
    redirect("/receipts?error=" + encodeURIComponent(entryItemsErr.message));
  }

  const movementRows = items.map((item) => ({
    site_id: siteId,
    product_id: item.product_id,
    movement_type: "receipt_in",
    quantity: item.quantity_received,
    input_qty: item.quantity_received,
    input_unit_code: item.stock_unit_code,
    conversion_factor_to_stock: 1,
    stock_unit_code: item.stock_unit_code,
    stock_unit_cost: item.stock_unit_cost,
    line_total_cost: item.line_total_cost,
    note: `Recepcion ORIGO ${entry.id}`,
  }));
  const { error: movementErr } = await supabase.from("inventory_movements").insert(movementRows);
  if (movementErr) {
    redirect("/receipts?error=" + encodeURIComponent(movementErr.message));
  }

  const productIdsWithReceipt = Array.from(new Set(items.map((row) => row.product_id)));
  const { data: globalStockRows } = await supabase
    .from("inventory_stock_by_site")
    .select("product_id,current_qty")
    .in("product_id", productIdsWithReceipt);
  const globalQtyBeforeMap = new Map<string, number>();
  for (const row of (globalStockRows ?? []) as Array<{ product_id: string; current_qty: number | null }>) {
    const previous = globalQtyBeforeMap.get(row.product_id) ?? 0;
    globalQtyBeforeMap.set(row.product_id, previous + Number(row.current_qty ?? 0));
  }

  const { data: existingSiteStocks } = await supabase
    .from("inventory_stock_by_site")
    .select("product_id,current_qty")
    .eq("site_id", siteId)
    .in("product_id", productIdsWithReceipt);
  const siteQtyMap = new Map(
    ((existingSiteStocks ?? []) as Array<{ product_id: string; current_qty: number | null }>).map((row) => [
      row.product_id,
      Number(row.current_qty ?? 0),
    ])
  );

  for (const item of items) {
    const currentQty = siteQtyMap.get(item.product_id) ?? 0;
    const nextQty = roundQuantity(currentQty + item.quantity_received);
    siteQtyMap.set(item.product_id, nextQty);
    const { error: stockErr } = await supabase
      .from("inventory_stock_by_site")
      .upsert(
        {
          site_id: siteId,
          product_id: item.product_id,
          current_qty: nextQty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "site_id,product_id" }
      );
    if (stockErr) {
      redirect("/receipts?error=" + encodeURIComponent(stockErr.message));
    }
  }

  for (const item of items) {
    const { error: locErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
      p_location_id: item.location_id,
      p_product_id: item.product_id,
      p_delta: item.quantity_received,
    });
    if (locErr) {
      redirect("/receipts?error=" + encodeURIComponent(locErr.message));
    }
  }

  const { data: policyRow } = await supabase
    .from("inventory_cost_policies")
    .select("cost_basis,is_active")
    .eq("site_id", siteId)
    .maybeSingle();
  const basis =
    policyRow && policyRow.is_active === false
      ? "net"
      : (String(policyRow?.cost_basis ?? "net") as "net" | "gross");

  const receiptByProduct = new Map<string, { qtyIn: number; lineCostTotal: number; applyAutoCost: boolean }>();
  for (const row of items) {
    const previous = receiptByProduct.get(row.product_id) ?? {
      qtyIn: 0,
      lineCostTotal: 0,
      applyAutoCost: false,
    };
    receiptByProduct.set(row.product_id, {
      qtyIn: previous.qtyIn + row.quantity_received,
      lineCostTotal: previous.lineCostTotal + row.line_total_cost,
      applyAutoCost: previous.applyAutoCost || row.apply_auto_cost,
    });
  }

  for (const [productId, receipt] of receiptByProduct.entries()) {
    if (!receipt.applyAutoCost || receipt.qtyIn <= 0) continue;

    const costBefore = Number(productMap.get(productId)?.cost ?? 0);
    const qtyBefore = Number(globalQtyBeforeMap.get(productId) ?? 0);
    const costIn = receipt.qtyIn > 0 ? receipt.lineCostTotal / receipt.qtyIn : 0;
    const costAfter = computeWeightedAverageCost({
      currentQty: qtyBefore,
      currentUnitCost: costBefore,
      receivedQty: receipt.qtyIn,
      receivedUnitCost: costIn,
    });

    const { error: updateCostErr } = await supabase
      .from("products")
      .update({ cost: costAfter, updated_at: new Date().toISOString() })
      .eq("id", productId);
    if (updateCostErr) {
      redirect("/receipts?error=" + encodeURIComponent(updateCostErr.message));
    }

    const { error: costEventErr } = await supabase.from("product_cost_events").insert({
      product_id: productId,
      site_id: siteId,
      source: "entry",
      source_entry_id: entry.id,
      qty_before: qtyBefore,
      qty_in: receipt.qtyIn,
      cost_before: costBefore,
      cost_in: costIn,
      cost_after: costAfter,
      basis,
      created_by: user.id,
    });
    if (costEventErr) {
      redirect("/receipts?error=" + encodeURIComponent(costEventErr.message));
    }
  }

  if (purchaseOrderId) {
    const receivedByPoItem = new Map<string, number>();
    for (const row of items) {
      if (!row.purchase_order_item_id) continue;
      const previous = receivedByPoItem.get(row.purchase_order_item_id) ?? 0;
      receivedByPoItem.set(row.purchase_order_item_id, previous + row.quantity_received);
    }

    for (const [poItemId, qtyReceived] of receivedByPoItem.entries()) {
      const { data: poItem, error: poItemErr } = await supabase
        .from("purchase_order_items")
        .select("quantity_received")
        .eq("id", poItemId)
        .maybeSingle();
      if (poItemErr) {
        redirect("/receipts?error=" + encodeURIComponent(poItemErr.message));
      }

      const currentReceived = Number(poItem?.quantity_received ?? 0);
      const nextReceived = roundQuantity(currentReceived + qtyReceived, 6);
      const { error: poItemUpdateErr } = await supabase
        .from("purchase_order_items")
        .update({ quantity_received: nextReceived })
        .eq("id", poItemId);
      if (poItemUpdateErr) {
        redirect("/receipts?error=" + encodeURIComponent(poItemUpdateErr.message));
      }
    }

    const { data: poAllItems, error: poItemsErr } = await supabase
      .from("purchase_order_items")
      .select("quantity_ordered,quantity_received")
      .eq("purchase_order_id", purchaseOrderId);
    if (poItemsErr) {
      redirect("/receipts?error=" + encodeURIComponent(poItemsErr.message));
    }

    const allReceived = (poAllItems ?? []).every((row) => {
      const ordered = Number(row.quantity_ordered ?? 0);
      const received = Number(row.quantity_received ?? 0);
      return ordered > 0 && received >= ordered;
    });
    if (allReceived && (poAllItems ?? []).length > 0) {
      const { error: poStatusErr } = await supabase
        .from("purchase_orders")
        .update({ status: "received", received_at: new Date().toISOString() })
        .eq("id", purchaseOrderId);
      if (poStatusErr) {
        redirect("/receipts?error=" + encodeURIComponent(poStatusErr.message));
      }
    }
  }

  redirect("/receipts?ok=created");
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = safeDecode(sp.error);
  const okMsg = safeDecode(sp.ok);

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/receipts",
    permissionCode: RECEIPTS_PERMISSION,
  });

  const [{ data: employee }, { data: settings }] = await Promise.all([
    supabase.from("employees").select("site_id").eq("id", user.id).maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", user.id)
      .maybeSingle(),
  ]);
  const siteId = String(settings?.selected_site_id ?? employee?.site_id ?? "").trim();
  if (!siteId) {
    redirect("/no-access?reason=no_site&returnTo=/receipts");
  }

  const [{ data: suppliersData }, { data: productsData }, { data: locationsData }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id,name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(300),
    supabase
      .from("product_inventory_profiles")
      .select("product_id,lot_tracking,expiry_tracking,products(id,name,unit,stock_unit_code,cost)")
      .eq("track_inventory", true)
      .in("inventory_kind", ["ingredient", "finished", "resale", "packaging"])
      .order("name", { foreignTable: "products", ascending: true })
      .limit(500),
    supabase
      .from("inventory_locations")
      .select("id,code,zone,description")
      .eq("site_id", siteId)
      .eq("is_active", true)
      .in("code", OPERATIONAL_RECEIPT_LOCATION_CODES)
      .order("code", { ascending: true })
      .limit(50),
  ]);

  const suppliers = (suppliersData ?? []) as SupplierRow[];
  const products = ((productsData ?? []) as ProductProfileWithProduct[])
    .map((row) => {
      const product = Array.isArray(row.products) ? row.products[0] ?? null : row.products;
      if (!product) return null;
      return {
        ...product,
        lot_tracking: Boolean(row.lot_tracking),
        expiry_tracking: Boolean(row.expiry_tracking),
      } satisfies ProductFormRow;
    })
    .filter((row): row is ProductFormRow => Boolean(row));
  const locations = ((locationsData ?? []) as LocationRow[]).sort((a, b) => {
    const aOrder = OPERATIONAL_RECEIPT_LOCATION_ORDER.get(String(a.code ?? "")) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = OPERATIONAL_RECEIPT_LOCATION_ORDER.get(String(b.code ?? "")) ?? Number.MAX_SAFE_INTEGER;

    if (aOrder !== bOrder) return aOrder - bOrder;

    return String(a.description ?? a.code ?? a.id).localeCompare(
      String(b.description ?? b.code ?? b.id),
      "es",
      { numeric: true, sensitivity: "base" }
    );
  });

  const locationIdsForPositions = locations
    .map((location) => location.id)
    .filter(Boolean);

  const { data: locationPositionsData } =
    locationIdsForPositions.length > 0
      ? await supabase
        .from("inventory_location_positions")
        .select("id,location_id,parent_position_id,code,name,kind,sort_order")
        .in("location_id", locationIdsForPositions)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true })
      : { data: [] as LocationPositionRow[] };

  const locationOrderById = new Map(locations.map((location, index) => [location.id, index]));

  const locationPositions = ((locationPositionsData ?? []) as LocationPositionRow[]).sort((a, b) => {
    const aLocationOrder = locationOrderById.get(a.location_id) ?? Number.MAX_SAFE_INTEGER;
    const bLocationOrder = locationOrderById.get(b.location_id) ?? Number.MAX_SAFE_INTEGER;

    if (aLocationOrder !== bLocationOrder) return aLocationOrder - bLocationOrder;

    const aSortOrder = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
    const bSortOrder = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;

    if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;

    return String(a.name || a.code || a.id).localeCompare(String(b.name || b.code || b.id), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });

  const purchaseOrderId = String(sp.purchase_order_id ?? "").trim();
  let prefillSupplierId = "";
  let prefillInvoiceNumber = "";
  let prefillNotes = "";
  let prefillRows: Array<{
    productId: string;
    quantity: number;
    unitCost: number;
    purchaseOrderItemId: string;
  }> = [];

  if (purchaseOrderId) {
    const { data: poRow } = await supabase
      .from("purchase_orders")
      .select("id,supplier_id,site_id,notes")
      .eq("id", purchaseOrderId)
      .maybeSingle();
    const purchaseOrder = poRow as PurchaseOrderRow | null;
    if (purchaseOrder?.site_id === siteId) {
      prefillSupplierId = String(purchaseOrder.supplier_id ?? "");
      prefillInvoiceNumber = formatPurchaseOrderRef({
        id: String(purchaseOrder.id ?? ""),
        createdAt: purchaseOrder.created_at,
      });
      prefillNotes = String(purchaseOrder.notes ?? "");

      const { data: poItemsData } = await supabase
        .from("purchase_order_items")
        .select("id,product_id,quantity_ordered,quantity_received,unit_cost")
        .eq("purchase_order_id", purchaseOrderId)
        .order("created_at", { ascending: true });
      const poItems = (poItemsData ?? []) as PurchaseOrderItemRow[];
      prefillRows = poItems
        .map((row) => {
          const ordered = Number(row.quantity_ordered ?? 0);
          const received = Number(row.quantity_received ?? 0);
          const pending = roundQuantity(Math.max(ordered - received, 0), 6);
          if (!row.product_id || pending <= 0) return null;
          return {
            productId: row.product_id,
            quantity: pending,
            unitCost: Number(row.unit_cost ?? 0),
            purchaseOrderItemId: row.id,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
    }
  }

  const { data: purchaseOrdersData } = await supabase
    .from("purchase_orders")
    .select("id,status,created_at,suppliers(name)")
    .eq("site_id", siteId)
    .in("status", ["draft", "sent", "received"])
    .order("created_at", { ascending: false })
    .limit(200);
  const purchaseOrders = (purchaseOrdersData ?? []) as PurchaseOrderRow[];

  let entriesQuery = await supabase
    .from("inventory_entries")
    .select("id,supplier_name,invoice_number,status,received_at,created_at")
    .eq("site_id", siteId)
    .eq("source_app", "origo")
    .order("created_at", { ascending: false })
    .limit(20);
  if (entriesQuery.error && entriesQuery.error.code === "42703") {
    entriesQuery = await supabase
      .from("inventory_entries")
      .select("id,supplier_name,invoice_number,status,received_at,created_at")
      .eq("site_id", siteId)
      .order("created_at", { ascending: false })
      .limit(20);
  }
  const entryRows = (entriesQuery.data ?? []) as EntryRow[];

  return (
    <div className="w-full space-y-6">
      <div className="ui-panel space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="ui-h1">Recepciones</h1>
            <p className="ui-body-muted">
              Flujo principal de entradas desde ORIGO. Impacta inventario y costo promedio.
            </p>
          </div>
          <Link href="/purchase-orders" className="ui-btn ui-btn--ghost">
            Ver ordenes de compra
          </Link>
        </div>
        {okMsg ? <div className="ui-alert ui-alert--success">Recepcion registrada correctamente.</div> : null}
      </div>

      <ReceiptForm
        action={createReceipt}
        siteId={siteId}
        suppliers={suppliers}
        products={products}
        locations={locations}
        locationPositions={locationPositions}
        purchaseOrders={purchaseOrders.map((po) => ({
          id: po.id,
          created_at: po.created_at,
          status: po.status,
          suppliers: Array.isArray(po.suppliers) ? po.suppliers[0] ?? null : po.suppliers ?? null,
        }))}
        selectedPurchaseOrderId={purchaseOrderId}
        prefillSupplierId={prefillSupplierId}
        prefillInvoiceNumber={prefillInvoiceNumber}
        prefillNotes={prefillNotes}
        prefillRows={prefillRows}
        serverErrorMessage={errorMsg}
        submitSuccess={Boolean(okMsg)}
      />

      <div className="ui-panel">
        <div className="ui-h3">Recepciones recientes</div>
        <div className="mt-4 overflow-x-auto">
          <table className="ui-table min-w-full text-sm">
            <thead className="text-left text-[var(--ui-muted)]">
              <tr>
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Proveedor</th>
                <th className="py-2 pr-3">Factura</th>
                <th className="py-2 pr-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {entryRows.map((entryRow) => (
                <tr key={entryRow.id} className="border-t border-zinc-200/60">
                  <td className="py-2 pr-3 font-mono">{entryRow.received_at ?? entryRow.created_at ?? "-"}</td>
                  <td className="py-2 pr-3">{entryRow.supplier_name ?? "-"}</td>
                  <td className="py-2 pr-3">{entryRow.invoice_number ?? "-"}</td>
                  <td className="py-2 pr-3">{entryRow.status ?? "-"}</td>
                </tr>
              ))}
              {!entryRows.length ? (
                <tr>
                  <td className="py-4 text-[var(--ui-muted)]" colSpan={4}>
                    No hay recepciones registradas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
