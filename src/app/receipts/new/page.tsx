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

const RECEIPT_CATALOG_INVENTORY_KINDS = ["ingredient", "resale", "packaging"];
const RECEIPT_CATALOG_PAGE_SIZE = 1000;
const PRODUCT_RELATION_BATCH_SIZE = 200;
const RECEIPT_ACTION_WINDOW_MINUTES = 30;
const RECEIPT_ACTION_WINDOW_MS = RECEIPT_ACTION_WINDOW_MINUTES * 60 * 1000;

type SearchParams = {
  error?: string;
  ok?: string;
  purchase_order_id?: string;
  site_id?: string;
  correction_entry_id?: string;
};

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  cost: number | null;
};

type ProductPresentationOption = {
  id: string;
  product_id: string;
  label: string;
  input_unit_code: string;
  qty_in_stock_unit: number;
  is_default?: boolean | null;
  last_net_unit_cost?: number | null;
  avg_net_unit_cost?: number | null;
  last_stock_unit_cost?: number | null;
  avg_stock_unit_cost?: number | null;
  last_received_at?: string | null;
};

type ProductSupplierRow = {
  product_id: string;
  supplier_id: string;
};

type ProductUomProfileRow = {
  id: string;
  product_id: string;
  label: string | null;
  input_unit_code: string | null;
  qty_in_stock_unit: number | null;
};

type ProcurementSupplierProductCostRow = {
  supplier_id: string;
  product_id: string;
  input_uom_profile_id: string | null;
  input_unit_code: string | null;
  conversion_factor_to_stock: number | null;
  last_net_unit_cost: number | null;
  avg_net_unit_cost: number | null;
  last_stock_unit_cost: number | null;
  avg_stock_unit_cost: number | null;
  last_received_at: string | null;
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
  supplier_ids: string[];
  presentations: ProductPresentationOption[];
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type DataFetchResult<T> = {
  data: T[];
  errorMessage: string | null;
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
  purchase_order_id?: string | null;
  product_id: string;
  quantity_ordered: number | null;
  quantity_received: number | null;
  unit_cost: number | null;
  unit: string | null;
  input_uom_profile_id: string | null;
  input_unit_code: string | null;
  input_unit_label: string | null;
  conversion_factor_to_stock: number | null;
  stock_unit_code: string | null;
  stock_quantity_ordered: number | null;
  stock_unit_cost: number | null;
};

type EntryRow = {
  id: string;
  site_id?: string | null;
  supplier_id?: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  status: string | null;
  entry_mode: string | null;
  emergency_reason: string | null;
  purchase_order_id: string | null;
  received_at: string | null;
  created_at: string | null;
  notes?: string | null;
};

type ReversalRpcError = {
  message?: string;
};

type CorrectionEntryItemRow = {
  product_id: string | null;
  location_id: string | null;
  location_position_id: string | null;
  input_qty: number | null;
  quantity_received: number | null;
  input_unit_code: string | null;
  unit: string | null;
  input_uom_profile_id: string | null;
  conversion_factor_to_stock: number | null;
  stock_unit_code: string | null;
  input_unit_cost: number | null;
  net_unit_cost: number | null;
  cost_input_mode: string | null;
  tax_rate: number | null;
  purchase_order_item_id: string | null;
  lot_number: string | null;
  expiry_date: string | null;
  notes: string | null;
};

type MasterDataRequestKind = "new_product" | "new_presentation";

type MasterDataRequestPayload = {
  id?: string;
  kind?: string;
  status?: string;
  source?: string;
  siteId?: string;
  supplierId?: string;
  supplierName?: string | null;
  lineIndex?: number | string;
  productId?: string | null;
  productName?: string | null;
  requestedLabel?: string;
  inputUnitCode?: string;
  inputUnitLabel?: string;
  conversionFactorToStock?: number | string | null;
  stockUnitCode?: string;
  unitCost?: number | string | null;
  notes?: string | null;
  createdAt?: string;
};

type NormalizedMasterDataRequest = {
  kind: MasterDataRequestKind;
  lineIndex: number;
  productId: string | null;
  productName: string | null;
  requestedLabel: string;
  inputUnitCode: string | null;
  inputUnitLabel: string | null;
  conversionFactorToStock: number | null;
  stockUnitCode: string | null;
  unitCost: number | null;
  notes: string | null;
  payload: MasterDataRequestPayload;
};

function asCleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableCleanString(value: unknown): string | null {
  const text = asCleanString(value);
  return text || null;
}

function asPositiveNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeMasterDataRequestPayloads(formData: FormData): {
  requests: NormalizedMasterDataRequest[];
  errorMessage: string | null;
} {
  const rawPayloads = formData
    .getAll("master_data_request_payload")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  const requests: NormalizedMasterDataRequest[] = [];

  for (let index = 0; index < rawPayloads.length; index += 1) {
    const rawPayload = rawPayloads[index];
    let payload: MasterDataRequestPayload;

    try {
      const parsed = JSON.parse(rawPayload);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {
          requests: [],
          errorMessage: "Hay una solicitud de maestro de datos con formato inválido.",
        };
      }
      payload = parsed as MasterDataRequestPayload;
    } catch {
      return {
        requests: [],
        errorMessage: "Hay una solicitud de maestro de datos que no se pudo leer.",
      };
    }

    const kind = payload.kind === "new_product" || payload.kind === "new_presentation"
      ? payload.kind
      : null;
    if (!kind) {
      return {
        requests: [],
        errorMessage: "Hay una solicitud de maestro de datos con tipo inválido.",
      };
    }

    const requestedLabel = asCleanString(payload.requestedLabel);
    if (!requestedLabel) {
      return {
        requests: [],
        errorMessage: "Hay una solicitud de maestro de datos sin nombre.",
      };
    }

    const lineIndex = Number(payload.lineIndex ?? index);
    const safeLineIndex = Number.isInteger(lineIndex) && lineIndex >= 0 ? lineIndex : index;
    const productId = asNullableCleanString(payload.productId);
    const productName = asNullableCleanString(payload.productName);
    const inputUnitLabel = asNullableCleanString(payload.inputUnitLabel);
    const inputUnitCode = asNullableCleanString(payload.inputUnitCode);
    const stockUnitCode = asNullableCleanString(payload.stockUnitCode);
    const conversionFactorToStock = asPositiveNumberOrNull(payload.conversionFactorToStock);
    const unitCost = asPositiveNumberOrNull(payload.unitCost);
    const notes = asNullableCleanString(payload.notes);

    if (kind === "new_presentation") {
      if (!productId) {
        return {
          requests: [],
          errorMessage: "La solicitud de nueva presentación debe estar asociada a un producto existente.",
        };
      }

      if (!inputUnitLabel || !stockUnitCode || !conversionFactorToStock) {
        return {
          requests: [],
          errorMessage: "La solicitud de nueva presentación debe tener unidad, factor a stock y unidad stock.",
        };
      }
    }

    requests.push({
      kind,
      lineIndex: safeLineIndex,
      productId,
      productName,
      requestedLabel,
      inputUnitCode,
      inputUnitLabel,
      conversionFactorToStock,
      stockUnitCode,
      unitCost,
      notes,
      payload,
    });
  }

  return { requests, errorMessage: null };
}

function formatColombiaDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

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

function presentationDedupeKey(params: {
  label: string;
  inputUnitCode: string;
  factor: number;
}): string {
  return [
    params.label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim(),
    params.inputUnitCode.toLowerCase().trim(),
    String(roundQuantity(params.factor, 6)),
  ].join("|");
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

function getReceiptActionWindowState(createdAt: string | null | undefined, nowMs = Date.now()) {
  const createdMs = createdAt ? new Date(createdAt).getTime() : Number.NaN;

  if (!Number.isFinite(createdMs)) {
    return {
      isOpen: false,
      label: "Ventana cerrada",
      minutesRemaining: 0,
    };
  }

  const ageMs = Math.max(0, nowMs - createdMs);
  const remainingMs = RECEIPT_ACTION_WINDOW_MS - ageMs;

  if (remainingMs <= 0) {
    return {
      isOpen: false,
      label: "Corrección cerrada",
      minutesRemaining: 0,
    };
  }

  const minutesRemaining = Math.max(1, Math.ceil(remainingMs / 60000));

  return {
    isOpen: true,
    label: `Quedan ${minutesRemaining} min`,
    minutesRemaining,
  };
}

function buildReceiptsUrl(params: { siteId?: string; ok?: string; error?: string; purchaseOrderId?: string }) {
  const search = new URLSearchParams();
  if (params.siteId) search.set("site_id", params.siteId);
  if (params.purchaseOrderId) search.set("purchase_order_id", params.purchaseOrderId);
  if (params.ok) search.set("ok", params.ok);
  if (params.error) search.set("history_error", params.error);
  const qs = search.toString();
  return qs ? `/receipts?${qs}` : "/receipts";
}

function buildNewReceiptUrl(params: {
  siteId?: string;
  purchaseOrderId?: string;
  correctionEntryId?: string;
  error?: string;
}) {
  const search = new URLSearchParams();
  if (params.siteId) search.set("site_id", params.siteId);
  if (params.purchaseOrderId) search.set("purchase_order_id", params.purchaseOrderId);
  if (params.correctionEntryId) search.set("correction_entry_id", params.correctionEntryId);
  if (params.error) search.set("error", params.error);
  const qs = search.toString();
  return qs ? `/receipts/new?${qs}` : "/receipts/new";
}

function formatEntryStatus(status: string | null) {
  switch (status) {
    case "received":
      return "Recibida";
    case "reversed":
      return "Reversada";
    case "corrected":
      return "Corregida";
    case "draft":
      return "Borrador";
    case "cancelled":
      return "Cancelada";
    default:
      return status || "-";
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchReceiptCatalogProducts(
  supabase: SupabaseServerClient
): Promise<DataFetchResult<ProductProfileWithProduct>> {
  const rows: ProductProfileWithProduct[] = [];
  let from = 0;

  while (true) {
    const to = from + RECEIPT_CATALOG_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("product_inventory_profiles")
      .select("product_id,lot_tracking,expiry_tracking,products!inner(id,name,unit,stock_unit_code,cost)")
      .eq("track_inventory", true)
      .in("inventory_kind", RECEIPT_CATALOG_INVENTORY_KINDS)
      .eq("products.is_active", true)
      .order("name", { foreignTable: "products", ascending: true })
      .range(from, to);

    if (error) return { data: [], errorMessage: error.message };

    const batch = (data ?? []) as ProductProfileWithProduct[];
    rows.push(...batch);

    if (batch.length < RECEIPT_CATALOG_PAGE_SIZE) break;
    from += RECEIPT_CATALOG_PAGE_SIZE;
  }

  return { data: rows, errorMessage: null };
}

async function fetchProductSuppliers(
  supabase: SupabaseServerClient,
  productIds: string[]
): Promise<DataFetchResult<ProductSupplierRow>> {
  const rows: ProductSupplierRow[] = [];
  for (const batch of chunkArray(productIds, PRODUCT_RELATION_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from("product_suppliers")
      .select("product_id,supplier_id")
      .in("product_id", batch);

    if (error) return { data: [], errorMessage: error.message };
    rows.push(...((data ?? []) as ProductSupplierRow[]));
  }

  return { data: rows, errorMessage: null };
}

async function fetchProductUomProfiles(
  supabase: SupabaseServerClient,
  productIds: string[]
): Promise<DataFetchResult<ProductUomProfileRow>> {
  const rows: ProductUomProfileRow[] = [];
  for (const batch of chunkArray(productIds, PRODUCT_RELATION_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from("product_uom_profiles")
      .select("id,product_id,label,input_unit_code,qty_in_stock_unit")
      .in("product_id", batch)
      .eq("is_active", true)
      .eq("source", "manual")
      .order("label", { ascending: true });

    if (error) return { data: [], errorMessage: error.message };
    rows.push(...((data ?? []) as ProductUomProfileRow[]));
  }

  return { data: rows, errorMessage: null };
}

async function fetchProcurementSupplierProductCosts(
  supabase: SupabaseServerClient,
  productIds: string[]
): Promise<DataFetchResult<ProcurementSupplierProductCostRow>> {
  const rows: ProcurementSupplierProductCostRow[] = [];
  for (const batch of chunkArray(productIds, PRODUCT_RELATION_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from("procurement_supplier_product_costs")
      .select("supplier_id,product_id,input_uom_profile_id,input_unit_code,conversion_factor_to_stock,last_net_unit_cost,avg_net_unit_cost,last_stock_unit_cost,avg_stock_unit_cost,last_received_at")
      .in("product_id", batch)
      .eq("is_active", true);

    if (error) return { data: [], errorMessage: error.message };
    rows.push(...((data ?? []) as ProcurementSupplierProductCostRow[]));
  }

  return { data: rows, errorMessage: null };
}

async function createReceipt(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect("/login?returnTo=/receipts/new");
  }

  const siteId = asText(formData.get("site_id"));
  if (!siteId) {
    redirect(buildNewReceiptUrl({ error: "No tienes sede activa." }));
  }

  const { data: canReceive, error: permErr } = await supabase.rpc("has_permission", {
    p_permission_code: "origo.procurement.receipts",
    p_site_id: siteId,
    p_area_id: null,
  });
  if (permErr || !canReceive) {
    redirect(buildNewReceiptUrl({ siteId, error: "No tienes permiso para registrar recepciones." }));
  }

  const supplierId = asText(formData.get("supplier_id"));
  const invoiceNumber = asText(formData.get("invoice_number"));
  const receivedAt = asText(formData.get("received_at"));
  const notes = asText(formData.get("notes"));
  const purchaseOrderId = asText(formData.get("purchase_order_id")) || null;
  const emergencyReason = asText(formData.get("emergency_reason"));
  const correctionEntryId = asText(formData.get("correction_entry_id")) || null;
  const correctionComment = asText(formData.get("correction_comment"));

  const createErrorUrl = (message: string) =>
    buildNewReceiptUrl({
      siteId,
      purchaseOrderId: purchaseOrderId ?? undefined,
      correctionEntryId: correctionEntryId ?? undefined,
      error: message,
    });

  const entryMode: "normal" | "emergency" = purchaseOrderId ? "normal" : "emergency";

  if (!supplierId) {
    redirect(createErrorUrl("Proveedor requerido."));
  }

  if (entryMode === "emergency" && !emergencyReason) {
    redirect(createErrorUrl("Motivo requerido para registrar una recepcion de emergencia."));
  }

  const { data: supplierRow } = await supabase
    .from("suppliers")
    .select("name")
    .eq("id", supplierId)
    .maybeSingle();
  const supplierName = String(supplierRow?.name ?? "").trim();
  if (!supplierName) {
    redirect(createErrorUrl("Proveedor no valido."));
  }

  const { requests: masterDataRequests, errorMessage: masterDataRequestError } =
    normalizeMasterDataRequestPayloads(formData);
  if (masterDataRequestError) {
    redirect(createErrorUrl(masterDataRequestError));
  }

  if (masterDataRequests.length > 0) {
    const { error: masterDataTableErr } = await supabase
      .from("product_master_review_requests")
      .select("id")
      .limit(1);

    if (masterDataTableErr) {
      redirect(createErrorUrl("No se pudieron preparar las solicitudes de maestro de datos. Aplica la migración product_master_review_requests antes de usar esta acción."));
    }
  }

  if (purchaseOrderId) {
    const { data: purchaseOrderRow, error: purchaseOrderErr } = await supabase
      .from("purchase_orders")
      .select("id,site_id,supplier_id,status")
      .eq("id", purchaseOrderId)
      .maybeSingle();

    if (purchaseOrderErr) {
      redirect(createErrorUrl(purchaseOrderErr.message));
    }

    const purchaseOrderSiteId = String(purchaseOrderRow?.site_id ?? "").trim();
    const purchaseOrderSupplierId = String(purchaseOrderRow?.supplier_id ?? "").trim();
    const purchaseOrderStatus = String(purchaseOrderRow?.status ?? "").trim();

    if (!purchaseOrderRow || purchaseOrderSiteId !== siteId) {
      redirect(createErrorUrl("Orden de compra no valida para esta sede."));
    }

    const allowedPurchaseOrderStatuses = correctionEntryId
      ? ["draft", "sent", "received"]
      : ["draft", "sent"];

    if (!allowedPurchaseOrderStatuses.includes(purchaseOrderStatus)) {
      redirect(createErrorUrl("La orden de compra seleccionada ya no esta activa para recepción."));
    }

    if (purchaseOrderSupplierId && purchaseOrderSupplierId !== supplierId) {
      redirect(createErrorUrl("El proveedor no coincide con la orden de compra seleccionada."));
    }
  }

  const productIds = formData.getAll("item_product_id").map((value) => String(value).trim());
  const locationIds = formData.getAll("item_location_id").map((value) => String(value).trim());
  const locationPositionIds = formData
    .getAll("item_location_position_id")
    .map((value) => String(value).trim());
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
  const inputUomProfileIds = formData
    .getAll("item_presentation_id")
    .map((value) => String(value).trim());
  const costInputModes = formData
    .getAll("item_cost_input_mode")
    .map((value) => (String(value).trim() === "gross" ? "gross" : "net"));
  const taxIncludedValues = formData
    .getAll("item_tax_included")
    .map((value) => String(value).trim() === "true");
  const taxRates = formData
    .getAll("item_tax_rate")
    .map((value) => asNumber(String(value).trim()));
  const ivaRates = formData
    .getAll("item_iva_rate")
    .map((value) => asNumber(String(value).trim()));
  const icuiRates = formData
    .getAll("item_icui_rate")
    .map((value) => asNumber(String(value).trim()));
  const ivaAmounts = formData
    .getAll("item_iva_amount")
    .map((value) => asNumber(String(value).trim()));
  const icuiAmounts = formData
    .getAll("item_icui_amount")
    .map((value) => asNumber(String(value).trim()));
  const totalTaxRates = formData
    .getAll("item_total_tax_rate")
    .map((value) => asNumber(String(value).trim()));
  const netUnitCosts = formData
    .getAll("item_net_unit_cost")
    .map((value) => asNumber(String(value).trim()));
  const grossUnitCosts = formData
    .getAll("item_gross_unit_cost")
    .map((value) => asNumber(String(value).trim()));
  const netTotalCosts = formData
    .getAll("item_net_total_cost")
    .map((value) => asNumber(String(value).trim()));
  const grossTotalCosts = formData
    .getAll("item_gross_total_cost")
    .map((value) => asNumber(String(value).trim()));
  const taxAmounts = formData
    .getAll("item_tax_amount")
    .map((value) => asNumber(String(value).trim()));

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
  const selectedPoItemIds = Array.from(new Set(poItemIds.filter(Boolean)));
  let poItemMap = new Map<string, PurchaseOrderItemRow>();

  if (purchaseOrderId && selectedPoItemIds.length > 0) {
    const { data: poItemsForReceiptData, error: poItemsForReceiptErr } = await supabase
      .from("purchase_order_items")
      .select("id,purchase_order_id,product_id,quantity_ordered,quantity_received,unit_cost,unit,input_uom_profile_id,input_unit_code,input_unit_label,conversion_factor_to_stock,stock_unit_code,stock_quantity_ordered,stock_unit_cost")
      .eq("purchase_order_id", purchaseOrderId)
      .in("id", selectedPoItemIds);

    if (poItemsForReceiptErr) {
      redirect(createErrorUrl(poItemsForReceiptErr.message));
    }

    poItemMap = new Map(
      ((poItemsForReceiptData ?? []) as PurchaseOrderItemRow[]).map((row) => [row.id, row])
    );
  }

  const selectedPresentationIds = Array.from(new Set(inputUomProfileIds.filter(Boolean)));
  const { data: selectedPresentationRowsData, error: selectedPresentationRowsErr } =
    selectedPresentationIds.length > 0
      ? await supabase
        .from("product_uom_profiles")
        .select("id,product_id,label,input_unit_code,qty_in_stock_unit")
        .in("id", selectedPresentationIds)
        .eq("is_active", true)
        .eq("source", "manual")
      : { data: [] as ProductUomProfileRow[], error: null };

  if (selectedPresentationRowsErr) {
    redirect(createErrorUrl(selectedPresentationRowsErr.message));
  }

  const selectedPresentationById = new Map(
    ((selectedPresentationRowsData ?? []) as ProductUomProfileRow[]).map((row) => [row.id, row])
  );

  const items = productIds
    .map((productId, index) => {
      if (!productId) return null;
      const inputQty = Number(quantities[index] ?? 0);
      if (!Number.isFinite(inputQty) || inputQty <= 0) return null;

      const product = productMap.get(productId);
      const profile = profileMap.get(productId);
      const poItemId = poItemIds[index] || "";
      const poItem = poItemId ? poItemMap.get(poItemId) : null;

      if (purchaseOrderId && poItemId) {
        if (!poItem) {
          redirect(createErrorUrl("Hay una linea que no pertenece a la orden de compra seleccionada."));
        }

        if (poItem.product_id !== productId) {
          redirect(createErrorUrl("Hay una linea cuyo producto no coincide con la orden de compra."));
        }
      }

      const selectedPresentationId = inputUomProfileIds[index] || "";
      const selectedPresentation = selectedPresentationId
        ? selectedPresentationById.get(selectedPresentationId)
        : null;

      if (!poItemId) {
        if (!selectedPresentation || selectedPresentation.product_id !== productId) {
          redirect(createErrorUrl("Selecciona una presentación manual activa para cada item recibido."));
        }
      }

      const fallbackStockUnitCode = String(product?.stock_unit_code ?? product?.unit ?? "un").trim().toLowerCase();

      const stockUnitCode = poItemId
        ? String(poItem?.stock_unit_code ?? poItem?.input_unit_code ?? fallbackStockUnitCode).trim().toLowerCase()
        : fallbackStockUnitCode || "un";

      const inputUnitCode = poItemId
        ? String(poItem?.input_unit_code ?? stockUnitCode).trim().toLowerCase()
        : String(selectedPresentation?.input_unit_code ?? stockUnitCode).trim().toLowerCase();

      const inputUnitLabel = poItemId
        ? String(poItem?.input_unit_label ?? poItem?.unit ?? inputUnitCode).trim()
        : String(selectedPresentation?.label ?? inputUnitCode).trim();

      const conversionFactorToStockRaw = poItemId
        ? Number(poItem?.conversion_factor_to_stock ?? 0)
        : Number(selectedPresentation?.qty_in_stock_unit ?? 0);

      const conversionFactorToStock =
        Number.isFinite(conversionFactorToStockRaw) && conversionFactorToStockRaw > 0
          ? conversionFactorToStockRaw
          : 1;

      const quantityReceived = roundQuantity(inputQty * conversionFactorToStock, 6);
      const defaultCost = Number(product?.cost ?? 0);
      const inputUnitCostRaw = Number(unitCosts[index] ?? poItem?.unit_cost ?? 0);
      const ivaRate = Math.max(0, Number(ivaRates[index] ?? taxRates[index] ?? 0));
      const icuiRate = Math.max(0, Number(icuiRates[index] ?? 0));
      const taxRate = Math.max(0, Number(totalTaxRates[index] ?? ivaRate + icuiRate));
      const taxIncluded = Boolean(taxIncludedValues[index]);
      const costInputMode = costInputModes[index] === "gross" ? "gross" : "net";

      const fallbackInputUnitCost =
        inputUnitCostRaw > 0
          ? inputUnitCostRaw
          : defaultCost > 0
            ? defaultCost * conversionFactorToStock
            : 0;

      const computedNetUnitCost =
        Number(netUnitCosts[index] ?? 0) > 0
          ? Number(netUnitCosts[index])
          : taxIncluded && taxRate > 0
            ? fallbackInputUnitCost / (1 + taxRate / 100)
            : fallbackInputUnitCost;

      const computedGrossUnitCost =
        Number(grossUnitCosts[index] ?? 0) > 0
          ? Number(grossUnitCosts[index])
          : taxIncluded
            ? fallbackInputUnitCost
            : fallbackInputUnitCost * (1 + taxRate / 100);

      const stockUnitCost =
        computedNetUnitCost > 0 && conversionFactorToStock > 0
          ? computedNetUnitCost / conversionFactorToStock
          : defaultCost > 0
            ? defaultCost
            : 0;

      const netTotalCost =
        Number(netTotalCosts[index] ?? 0) > 0
          ? Number(netTotalCosts[index])
          : roundQuantity(inputQty * computedNetUnitCost, 6);
      const grossTotalCost =
        Number(grossTotalCosts[index] ?? 0) > 0
          ? Number(grossTotalCosts[index])
          : roundQuantity(inputQty * computedGrossUnitCost, 6);
      const taxAmount =
        Number(taxAmounts[index] ?? 0) > 0
          ? Number(taxAmounts[index])
          : roundQuantity(Math.max(0, grossTotalCost - netTotalCost), 6);

      const lotNumber = lotNumbers[index] || null;
      const expiryDate = expiryDates[index] || null;

      if (profile?.lot_tracking && !lotNumber) {
        redirect(createErrorUrl("Hay items que requieren lote."));
      }
      if (profile?.expiry_tracking && !expiryDate) {
        redirect(createErrorUrl("Hay items que requieren fecha de vencimiento."));
      }

      return {
        product_id: productId,
        location_id: locationIds[index] || "",
        location_position_id: locationPositionIds[index] || null,
        input_qty: inputQty,
        input_unit_code: inputUnitCode,
        input_unit_label: inputUnitLabel,
        conversion_factor_to_stock: conversionFactorToStock,
        quantity_received: quantityReceived,
        quantity_declared: quantityReceived,
        stock_unit_code: stockUnitCode || "un",
        input_uom_profile_id: inputUomProfileIds[index] || poItem?.input_uom_profile_id || null,
        input_unit_cost: computedNetUnitCost > 0 ? roundQuantity(computedNetUnitCost, 6) : 0,
        stock_unit_cost: stockUnitCost > 0 ? roundQuantity(stockUnitCost, 6) : 0,
        line_total_cost: netTotalCost,
        tax_included: taxIncluded,
        tax_rate: taxRate,
        iva_rate: ivaRate,
        iva_amount: Number(ivaAmounts[index] ?? 0),
        icui_rate: icuiRate,
        icui_amount: Number(icuiAmounts[index] ?? 0),
        total_tax_rate: taxRate,
        cost_input_mode: costInputMode,
        net_unit_cost: computedNetUnitCost > 0 ? roundQuantity(computedNetUnitCost, 6) : 0,
        gross_unit_cost: computedGrossUnitCost > 0 ? roundQuantity(computedGrossUnitCost, 6) : 0,
        net_total_cost: netTotalCost,
        gross_total_cost: grossTotalCost,
        tax_amount: taxAmount,
        purchase_order_item_id: poItemId || null,
        cost_source: inputUnitCostRaw > 0 ? "manual" : "fallback_product_cost",
        lot_number: lotNumber,
        expiry_date: expiryDate,
        notes: lineNotes[index] || null,
        apply_auto_cost:
          Boolean(profile?.track_inventory) && profile?.costing_mode === "auto_primary_supplier",
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (!items.length) {
    redirect(createErrorUrl("Agrega al menos un item con cantidad mayor a 0."));
  }

  if (items.some((item) => !item.location_id)) {
    redirect(createErrorUrl("Selecciona una LOC para cada item."));
  }

  const selectedLocationIds = Array.from(new Set(items.map((item) => item.location_id).filter(Boolean)));
  const { data: selectedLocationRowsData, error: selectedLocationRowsErr } =
    selectedLocationIds.length > 0
      ? await supabase
        .from("inventory_locations")
        .select("id")
        .eq("site_id", siteId)
        .eq("is_active", true)
        .in("id", selectedLocationIds)
      : { data: [] as Array<{ id: string }>, error: null };

  if (selectedLocationRowsErr) {
    redirect(createErrorUrl(selectedLocationRowsErr.message));
  }

  const validLocationIds = new Set(
    ((selectedLocationRowsData ?? []) as Array<{ id: string }>).map((row) => row.id)
  );

  if (items.some((item) => !validLocationIds.has(item.location_id))) {
    redirect(createErrorUrl("Hay un LOC no valido para esta sede."));
  }

  const selectedLocationPositionIds = Array.from(
    new Set(
      items
        .map((item) => item.location_position_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  if (selectedLocationPositionIds.length > 0) {
    const { data: positionRowsData, error: positionRowsErr } = await supabase
      .from("inventory_location_positions")
      .select("id,location_id")
      .in("id", selectedLocationPositionIds)
      .eq("is_active", true);

    if (positionRowsErr) {
      redirect(createErrorUrl(positionRowsErr.message));
    }

    const positionLocationMap = new Map(
      ((positionRowsData ?? []) as Array<{ id: string; location_id: string }>).map((row) => [
        row.id,
        row.location_id,
      ])
    );

    const hasInvalidLocationPosition = items.some((item) => {
      if (!item.location_position_id) return false;
      return positionLocationMap.get(item.location_position_id) !== item.location_id;
    });

    if (hasInvalidLocationPosition) {
      redirect(createErrorUrl("Hay una ubicación interna que no pertenece al LOC seleccionado."));
    }
  }

  if (correctionEntryId) {
    if (!correctionComment) {
      redirect(createErrorUrl("El comentario de corrección es obligatorio."));
    }

    const { data: originalEntry, error: originalEntryErr } = await supabase
      .from("inventory_entries")
      .select("id,site_id,status,source_app,created_at")
      .eq("id", correctionEntryId)
      .maybeSingle();

    if (originalEntryErr) {
      redirect(createErrorUrl(originalEntryErr.message));
    }

    if (!originalEntry || String(originalEntry.site_id ?? "") !== siteId) {
      redirect(createErrorUrl("La recepción original no pertenece a esta sede."));
    }

    if (String(originalEntry.status ?? "") !== "received") {
      redirect(createErrorUrl("Solo se pueden corregir recepciones en estado Recibida."));
    }

    const actionWindow = getReceiptActionWindowState(String(originalEntry.created_at ?? ""));

    if (!actionWindow.isOpen) {
      redirect(
        createErrorUrl(
          `La ventana para corregir esta recepción ya cerró. Máximo ${RECEIPT_ACTION_WINDOW_MINUTES} minutos desde su creación.`
        )
      );
    }

    const { error: reverseForCorrectionErr } = await supabase.rpc("origo_reverse_inventory_entry", {
      p_entry_id: correctionEntryId,
      p_comment: correctionComment,
    });

    if (reverseForCorrectionErr) {
      const reversalError = reverseForCorrectionErr as ReversalRpcError;
      redirect(createErrorUrl(reversalError.message ?? "No se pudo reversar la recepción original para corregirla."));
    }
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
    redirect(createErrorUrl(entryErr?.message ?? "No se pudo crear la recepcion."));
  }

  const entryItemRows = items.map((item) => ({
    entry_id: entry.id,
    product_id: item.product_id,
    location_id: item.location_id,
    location_position_id: item.location_position_id,
    quantity_declared: item.quantity_declared,
    quantity_received: item.quantity_received,
    unit: item.input_unit_label || item.input_unit_code,
    input_qty: item.input_qty,
    input_unit_code: item.input_unit_code,
    conversion_factor_to_stock: item.conversion_factor_to_stock,
    stock_unit_code: item.stock_unit_code,
    input_uom_profile_id: item.input_uom_profile_id,
    input_unit_cost: item.input_unit_cost,
    stock_unit_cost: item.stock_unit_cost,
    line_total_cost: item.line_total_cost,
    tax_included: item.tax_included,
    tax_rate: item.tax_rate,
    iva_rate: item.iva_rate,
    iva_amount: item.iva_amount,
    icui_rate: item.icui_rate,
    icui_amount: item.icui_amount,
    total_tax_rate: item.total_tax_rate,
    cost_input_mode: item.cost_input_mode,
    net_unit_cost: item.net_unit_cost,
    gross_unit_cost: item.gross_unit_cost,
    net_total_cost: item.net_total_cost,
    gross_total_cost: item.gross_total_cost,
    tax_amount: item.tax_amount,
    cost_source: item.cost_source,
    currency: "COP",
    purchase_order_item_id: item.purchase_order_item_id,
    lot_number: item.lot_number,
    expiry_date: item.expiry_date,
    notes: item.notes,
  }));
  const { error: entryItemsErr } = await supabase.from("inventory_entry_items").insert(entryItemRows);
  if (entryItemsErr) {
    redirect(createErrorUrl(entryItemsErr.message));
  }

  const movementRows = items.map((item) => ({
    site_id: siteId,
    product_id: item.product_id,
    location_position_id: item.location_position_id,
    movement_type: "receipt_in",
    quantity: item.quantity_received,
    input_qty: item.input_qty,
    input_unit_code: item.input_unit_code,
    conversion_factor_to_stock: item.conversion_factor_to_stock,
    stock_unit_code: item.stock_unit_code,
    stock_unit_cost: item.stock_unit_cost,
    line_total_cost: item.line_total_cost,
    note: `Recepcion ORIGO ${entry.id}`,
  }));
  const { error: movementErr } = await supabase.from("inventory_movements").insert(movementRows);
  if (movementErr) {
    redirect(createErrorUrl(movementErr.message));
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
      redirect(createErrorUrl(stockErr.message));
    }
  }

  for (const item of items) {
    const { error: locErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
      p_location_id: item.location_id,
      p_product_id: item.product_id,
      p_delta: item.quantity_received,
    });
    if (locErr) {
      redirect(createErrorUrl(locErr.message));
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
      redirect(createErrorUrl(updateCostErr.message));
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
      redirect(createErrorUrl(costEventErr.message));
    }
  }

  if (purchaseOrderId) {
    const receivedByPoItem = new Map<string, number>();
    for (const row of items) {
      if (!row.purchase_order_item_id) continue;
      const previous = receivedByPoItem.get(row.purchase_order_item_id) ?? 0;
      receivedByPoItem.set(row.purchase_order_item_id, previous + row.input_qty);
    }

    for (const [poItemId, qtyReceived] of receivedByPoItem.entries()) {
      const { data: poItem, error: poItemErr } = await supabase
        .from("purchase_order_items")
        .select("quantity_received")
        .eq("id", poItemId)
        .maybeSingle();
      if (poItemErr) {
        redirect(createErrorUrl(poItemErr.message));
      }

      const currentReceived = Number(poItem?.quantity_received ?? 0);
      const nextReceived = roundQuantity(currentReceived + qtyReceived, 6);
      const { error: poItemUpdateErr } = await supabase
        .from("purchase_order_items")
        .update({ quantity_received: nextReceived })
        .eq("id", poItemId);
      if (poItemUpdateErr) {
        redirect(createErrorUrl(poItemUpdateErr.message));
      }
    }

    const { data: poAllItems, error: poItemsErr } = await supabase
      .from("purchase_order_items")
      .select("quantity_ordered,quantity_received")
      .eq("purchase_order_id", purchaseOrderId);
    if (poItemsErr) {
      redirect(createErrorUrl(poItemsErr.message));
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
        redirect(createErrorUrl(poStatusErr.message));
      }
    }
  }

  if (masterDataRequests.length > 0) {
    const requestRows = masterDataRequests.map((request) => ({
      request_kind: request.kind,
      status: "pending_review",
      source_app: "origo",
      source_flow: "receipt",
      site_id: siteId,
      supplier_id: supplierId || null,
      product_id: request.productId,
      source_entry_id: entry.id,
      line_index: request.lineIndex,
      requested_label: request.requestedLabel,
      input_unit_code: request.inputUnitCode,
      input_unit_label: request.inputUnitLabel,
      conversion_factor_to_stock: request.conversionFactorToStock,
      stock_unit_code: request.stockUnitCode,
      unit_cost: request.unitCost,
      currency: "COP",
      notes: request.notes,
      payload: {
        ...request.payload,
        server_site_id: siteId,
        server_supplier_id: supplierId,
        server_supplier_name: supplierName,
        server_source_entry_id: entry.id,
      },
      created_by: user.id,
    }));

    const { error: requestInsertErr } = await supabase
      .from("product_master_review_requests")
      .insert(requestRows);

    if (requestInsertErr) {
      redirect(createErrorUrl("La recepcion se registro, pero no se pudieron guardar las solicitudes de maestro de datos: " + requestInsertErr.message));
    }
  }

  if (correctionEntryId) {
    const { error: markCorrectedErr } = await supabase.rpc("origo_mark_inventory_entry_corrected", {
      p_original_entry_id: correctionEntryId,
      p_replacement_entry_id: entry.id,
    });

    if (markCorrectedErr) {
      redirect(buildReceiptsUrl({ siteId, error: "La recepción corregida se creó, pero no se pudo cerrar la auditoría de corrección: " + markCorrectedErr.message }));
    }
  }

  redirect(buildReceiptsUrl({ siteId, ok: correctionEntryId ? "corrected" : "created" }));
}

async function reverseReceipt(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect("/login?returnTo=/receipts/new");
  }

  const entryId = asText(formData.get("entry_id"));
  const siteId = asText(formData.get("site_id"));
  const correctionComment = asText(formData.get("correction_comment"));

  if (!entryId) {
    redirect(buildReceiptsUrl({ siteId, error: "Recepción requerida para reversar." }));
  }

  if (!correctionComment) {
    redirect(buildReceiptsUrl({ siteId, error: "El comentario de reversión es obligatorio." }));
  }

  const { error } = await supabase.rpc("origo_reverse_inventory_entry", {
    p_entry_id: entryId,
    p_comment: correctionComment,
  });

  if (error) {
    const reversalError = error as ReversalRpcError;
    redirect(
      buildReceiptsUrl({
        siteId,
        error: reversalError.message ?? "No se pudo reversar la recepción.",
      })
    );
  }

  redirect(buildReceiptsUrl({ siteId, ok: "reversed" }));
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = safeDecode(sp.error);
  const okMsg = safeDecode(sp.ok);
  const correctionEntryId = String(sp.correction_entry_id ?? "").trim();

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
  const requestedSiteId = String(sp.site_id ?? "").trim();
  const savedSiteId = String(settings?.selected_site_id ?? employee?.site_id ?? "").trim();
  const siteId = requestedSiteId || savedSiteId;
  if (!siteId) {
    redirect("/no-access?reason=no_site&returnTo=/receipts/new");
  }

  const { data: activeSiteData } = await supabase
    .from("sites")
    .select("name")
    .eq("id", siteId)
    .maybeSingle();
  const activeSiteName = String(activeSiteData?.name ?? siteId).trim();

  const [
    { data: suppliersData },
    receiptCatalogResult,
    { data: locationsData },
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id,name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(300),
    fetchReceiptCatalogProducts(supabase),
    supabase
      .from("inventory_locations")
      .select("id,code,zone,description")
      .eq("site_id", siteId)
      .eq("is_active", true)
      .order("code", { ascending: true })
      .limit(300),
  ]);

  if (receiptCatalogResult.errorMessage) {
    redirect(buildNewReceiptUrl({ siteId, correctionEntryId, error: receiptCatalogResult.errorMessage }));
  }

  const productsData = receiptCatalogResult.data;
  const suppliers = (suppliersData ?? []) as SupplierRow[];
  const baseProducts = ((productsData ?? []) as ProductProfileWithProduct[])
    .map((row) => {
      const product = Array.isArray(row.products) ? row.products[0] ?? null : row.products;
      if (!product) return null;
      return {
        ...product,
        lot_tracking: Boolean(row.lot_tracking),
        expiry_tracking: Boolean(row.expiry_tracking),
      };
    })
    .filter((row): row is ProductRow & { lot_tracking: boolean; expiry_tracking: boolean } => Boolean(row))
    .sort((a, b) =>
      String(a.name ?? a.id).localeCompare(String(b.name ?? b.id), "es", {
        numeric: true,
        sensitivity: "base",
      })
    );

  const productIdsForCatalog = baseProducts.map((product) => product.id).filter(Boolean);

  const [
    productSuppliersResult,
    productUomProfilesResult,
    procurementCostResult,
  ] = await Promise.all([
    fetchProductSuppliers(supabase, productIdsForCatalog),
    fetchProductUomProfiles(supabase, productIdsForCatalog),
    fetchProcurementSupplierProductCosts(supabase, productIdsForCatalog),
  ]);

  const catalogRelationError =
    productSuppliersResult.errorMessage ??
    productUomProfilesResult.errorMessage ??
    procurementCostResult.errorMessage;
  if (catalogRelationError) {
    redirect(buildNewReceiptUrl({ siteId, correctionEntryId, error: catalogRelationError }));
  }

  const productSuppliersData = productSuppliersResult.data;
  const productUomProfilesData = productUomProfilesResult.data;
  const procurementCostData = procurementCostResult.data;

  const supplierIdsByProductId = new Map<string, Set<string>>();
  for (const row of (productSuppliersData ?? []) as ProductSupplierRow[]) {
    if (!row.product_id || !row.supplier_id) continue;
    const supplierIds = supplierIdsByProductId.get(row.product_id) ?? new Set<string>();
    supplierIds.add(row.supplier_id);
    supplierIdsByProductId.set(row.product_id, supplierIds);
  }

  const costsByPresentationKey = new Map<string, ProcurementSupplierProductCostRow>();
  for (const row of (procurementCostData ?? []) as ProcurementSupplierProductCostRow[]) {
    if (!row.product_id) continue;
    const key = [
      row.product_id,
      row.input_uom_profile_id ?? "",
      String(row.input_unit_code ?? "").toLowerCase(),
      Number(row.conversion_factor_to_stock ?? 0),
    ].join("|");
    costsByPresentationKey.set(key, row);
  }

  const presentationsByProductId = new Map<string, ProductPresentationOption[]>();
  const presentationKeysByProductId = new Map<string, Set<string>>();
  for (const row of (productUomProfilesData ?? []) as ProductUomProfileRow[]) {
    const factor = Number(row.qty_in_stock_unit ?? 0);
    if (!row.product_id || factor <= 0) continue;

    const label = String(row.label ?? row.input_unit_code ?? "Presentación").trim();
    const inputUnitCode = String(row.input_unit_code ?? label).trim().toLowerCase();
    const dedupeKey = presentationDedupeKey({ label, inputUnitCode, factor });
    const knownKeys = presentationKeysByProductId.get(row.product_id) ?? new Set<string>();
    if (knownKeys.has(dedupeKey)) continue;
    knownKeys.add(dedupeKey);
    presentationKeysByProductId.set(row.product_id, knownKeys);

    const key = [row.product_id, row.id, inputUnitCode, factor].join("|");
    const cost = costsByPresentationKey.get(key);

    const presentations = presentationsByProductId.get(row.product_id) ?? [];
    presentations.push({
      id: row.id,
      product_id: row.product_id,
      label,
      input_unit_code: inputUnitCode,
      qty_in_stock_unit: factor,
      last_net_unit_cost: cost?.last_net_unit_cost ?? null,
      avg_net_unit_cost: cost?.avg_net_unit_cost ?? null,
      last_stock_unit_cost: cost?.last_stock_unit_cost ?? null,
      avg_stock_unit_cost: cost?.avg_stock_unit_cost ?? null,
      last_received_at: cost?.last_received_at ?? null,
    });
    presentationsByProductId.set(row.product_id, presentations);
  }

  let products: ProductFormRow[] = baseProducts.map((product) => ({
    ...product,
    supplier_ids: Array.from(supplierIdsByProductId.get(product.id) ?? []),
    presentations: presentationsByProductId.get(product.id) ?? [],
  }));

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

  let purchaseOrderId = String(sp.purchase_order_id ?? "").trim();
  let selectedPurchaseOrderIdForForm = "";
  let prefillSupplierId = "";
  let prefillInvoiceNumber = "";
  let prefillNotes = "";
  let prefillReceivedAt = "";
  let prefillRows: Array<{
    productId: string;
    quantity: number;
    unitCost: number;
    purchaseOrderItemId: string;
    presentationId: string;
    inputUnitCode: string;
    inputUnitLabel: string;
    conversionFactorToStock: number;
    stockUnitCode: string;
    productSearch?: string;
    locationId?: string;
    positionId?: string;
    costInputMode?: "net" | "gross";
    taxRate?: number;
    lotNumber?: string;
    expiryDate?: string;
    notes?: string;
  }> = [];

  if (correctionEntryId) {
    const { data: correctionEntryData, error: correctionEntryErr } = await supabase
      .from("inventory_entries")
      .select("id,site_id,supplier_id,supplier_name,invoice_number,notes,status,entry_mode,emergency_reason,purchase_order_id,received_at,created_at")
      .eq("id", correctionEntryId)
      .maybeSingle();

    const correctionEntry = correctionEntryData as EntryRow | null;

    if (correctionEntryErr) {
      redirect(buildReceiptsUrl({ siteId, error: correctionEntryErr.message }));
    }

    if (!correctionEntry || String(correctionEntry.site_id ?? "") !== siteId) {
      redirect(buildReceiptsUrl({ siteId, error: "La recepción original no pertenece a esta sede." }));
    }

    if (String(correctionEntry.status ?? "") !== "received") {
      redirect(buildReceiptsUrl({ siteId, error: "Solo se pueden corregir recepciones en estado Recibida." }));
    }

    const actionWindow = getReceiptActionWindowState(String(correctionEntry.created_at ?? ""));

    if (!actionWindow.isOpen) {
      redirect(
        buildReceiptsUrl({
          siteId,
          error: `La ventana para corregir esta recepción ya cerró. Máximo ${RECEIPT_ACTION_WINDOW_MINUTES} minutos desde su creación.`,
        })
      );
    }

    const { data: correctionItemsData, error: correctionItemsErr } = await supabase
      .from("inventory_entry_items")
      .select("product_id,location_id,location_position_id,input_qty,quantity_received,input_unit_code,unit,input_uom_profile_id,conversion_factor_to_stock,stock_unit_code,input_unit_cost,net_unit_cost,cost_input_mode,tax_rate,purchase_order_item_id,lot_number,expiry_date,notes")
      .eq("entry_id", correctionEntryId)
      .order("created_at", { ascending: true });

    if (correctionItemsErr) {
      redirect(buildReceiptsUrl({ siteId, error: correctionItemsErr.message }));
    }

    const productLabelById = new Map(
      products.map((product) => {
        const unit = String(product.stock_unit_code ?? product.unit ?? "").trim();
        return [
          product.id,
          unit ? `${product.name ?? product.id} · ${unit}` : String(product.name ?? product.id),
        ];
      })
    );

    purchaseOrderId = String(correctionEntry.purchase_order_id ?? "").trim();
    selectedPurchaseOrderIdForForm = purchaseOrderId;
    prefillSupplierId = String(correctionEntry.supplier_id ?? "");
    prefillInvoiceNumber = String(correctionEntry.invoice_number ?? "");
    prefillNotes = String(correctionEntry.notes ?? "");
    prefillReceivedAt = String(correctionEntry.received_at ?? correctionEntry.created_at ?? "").slice(0, 10);

    prefillRows = ((correctionItemsData ?? []) as CorrectionEntryItemRow[])
      .map((row) => {
        if (!row.product_id) return null;

        const factor = Number(row.conversion_factor_to_stock ?? 0) > 0
          ? Number(row.conversion_factor_to_stock)
          : 1;
        const quantity =
          Number(row.input_qty ?? 0) > 0
            ? Number(row.input_qty)
            : factor > 0
              ? roundQuantity(Number(row.quantity_received ?? 0) / factor, 6)
              : Number(row.quantity_received ?? 0);

        return {
          productId: row.product_id,
          quantity,
          unitCost: Number(row.net_unit_cost ?? row.input_unit_cost ?? 0),
          purchaseOrderItemId: String(row.purchase_order_item_id ?? ""),
          presentationId: String(row.input_uom_profile_id ?? ""),
          inputUnitCode: String(row.input_unit_code ?? row.stock_unit_code ?? "").trim().toLowerCase(),
          inputUnitLabel: String(row.unit ?? row.input_unit_code ?? row.stock_unit_code ?? "").trim(),
          conversionFactorToStock: factor,
          stockUnitCode: String(row.stock_unit_code ?? row.input_unit_code ?? "").trim().toLowerCase(),
          productSearch: productLabelById.get(row.product_id) ?? "",
          locationId: String(row.location_id ?? ""),
          positionId: String(row.location_position_id ?? ""),
          costInputMode: (row.cost_input_mode === "gross" ? "gross" : "net") as "net" | "gross",
          taxRate: Number(row.tax_rate ?? 0),
          lotNumber: String(row.lot_number ?? ""),
          expiryDate: String(row.expiry_date ?? "").slice(0, 10),
          notes: String(row.notes ?? ""),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  } else if (purchaseOrderId) {
    const { data: poRow } = await supabase
      .from("purchase_orders")
      .select("id,supplier_id,site_id,status,created_at,notes")
      .eq("id", purchaseOrderId)
      .maybeSingle();
    const purchaseOrder = poRow as PurchaseOrderRow | null;
    if (
      purchaseOrder?.site_id === siteId &&
      ["draft", "sent"].includes(String(purchaseOrder.status ?? ""))
    ) {
      selectedPurchaseOrderIdForForm = purchaseOrderId;
      prefillSupplierId = String(purchaseOrder.supplier_id ?? "");
      prefillInvoiceNumber = formatPurchaseOrderRef({
        id: String(purchaseOrder.id ?? ""),
        createdAt: purchaseOrder.created_at,
      });
      prefillNotes = String(purchaseOrder.notes ?? "");

      const { data: poItemsData } = await supabase
        .from("purchase_order_items")
        .select("id,product_id,quantity_ordered,quantity_received,unit_cost,unit,input_uom_profile_id,input_unit_code,input_unit_label,conversion_factor_to_stock,stock_unit_code,stock_quantity_ordered,stock_unit_cost")
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
            presentationId: String(row.input_uom_profile_id ?? ""),
            inputUnitCode: String(row.input_unit_code ?? row.stock_unit_code ?? "").trim().toLowerCase(),
            inputUnitLabel: String(row.input_unit_label ?? row.unit ?? row.input_unit_code ?? "").trim(),
            conversionFactorToStock:
              Number(row.conversion_factor_to_stock ?? 0) > 0
                ? Number(row.conversion_factor_to_stock)
                : 1,
            stockUnitCode: String(row.stock_unit_code ?? row.input_unit_code ?? "").trim().toLowerCase(),
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
    }
  }

  const prefillProductIds = Array.from(new Set(prefillRows.map((row) => row.productId).filter(Boolean)));
  const existingProductIds = new Set(products.map((product) => product.id));
  const missingPrefillProductIds = prefillProductIds.filter((productId) => !existingProductIds.has(productId));

  if (missingPrefillProductIds.length > 0) {
    const [
      { data: missingProductsData },
      { data: missingProfileData },
      { data: missingProductSuppliersData },
      { data: missingProductUomProfilesData },
      { data: missingProcurementCostData },
    ] = await Promise.all([
      supabase
        .from("products")
        .select("id,name,unit,stock_unit_code,cost")
        .in("id", missingPrefillProductIds),
      supabase
        .from("product_inventory_profiles")
        .select("product_id,lot_tracking,expiry_tracking")
        .in("product_id", missingPrefillProductIds),
      supabase
        .from("product_suppliers")
        .select("product_id,supplier_id")
        .in("product_id", missingPrefillProductIds),
      supabase
        .from("product_uom_profiles")
        .select("id,product_id,label,input_unit_code,qty_in_stock_unit")
        .in("product_id", missingPrefillProductIds)
        .eq("is_active", true)
        .eq("source", "manual")
        .order("label", { ascending: true }),
      supabase
        .from("procurement_supplier_product_costs")
        .select("supplier_id,product_id,input_uom_profile_id,input_unit_code,conversion_factor_to_stock,last_net_unit_cost,avg_net_unit_cost,last_stock_unit_cost,avg_stock_unit_cost,last_received_at")
        .in("product_id", missingPrefillProductIds)
        .eq("is_active", true),
    ]);

    const missingProfileByProductId = new Map(
      ((missingProfileData ?? []) as Array<{
        product_id: string;
        lot_tracking?: boolean | null;
        expiry_tracking?: boolean | null;
      }>).map((row) => [row.product_id, row])
    );

    const missingSupplierIdsByProductId = new Map<string, Set<string>>();
    for (const row of (missingProductSuppliersData ?? []) as ProductSupplierRow[]) {
      if (!row.product_id || !row.supplier_id) continue;
      const supplierIds = missingSupplierIdsByProductId.get(row.product_id) ?? new Set<string>();
      supplierIds.add(row.supplier_id);
      missingSupplierIdsByProductId.set(row.product_id, supplierIds);
    }

    const missingCostsByPresentationKey = new Map<string, ProcurementSupplierProductCostRow>();
    for (const row of (missingProcurementCostData ?? []) as ProcurementSupplierProductCostRow[]) {
      if (!row.product_id) continue;
      const key = [
        row.product_id,
        row.input_uom_profile_id ?? "",
        String(row.input_unit_code ?? "").toLowerCase(),
        Number(row.conversion_factor_to_stock ?? 0),
      ].join("|");
      missingCostsByPresentationKey.set(key, row);
    }

    const missingPresentationsByProductId = new Map<string, ProductPresentationOption[]>();
    const missingPresentationKeysByProductId = new Map<string, Set<string>>();
    for (const row of (missingProductUomProfilesData ?? []) as ProductUomProfileRow[]) {
      const factor = Number(row.qty_in_stock_unit ?? 0);
      if (!row.product_id || factor <= 0) continue;

      const label = String(row.label ?? row.input_unit_code ?? "Presentación").trim();
      const inputUnitCode = String(row.input_unit_code ?? label).trim().toLowerCase();
      const dedupeKey = presentationDedupeKey({ label, inputUnitCode, factor });
      const knownKeys = missingPresentationKeysByProductId.get(row.product_id) ?? new Set<string>();
      if (knownKeys.has(dedupeKey)) continue;
      knownKeys.add(dedupeKey);
      missingPresentationKeysByProductId.set(row.product_id, knownKeys);

      const key = [row.product_id, row.id, inputUnitCode, factor].join("|");
      const cost = missingCostsByPresentationKey.get(key);

      const presentations = missingPresentationsByProductId.get(row.product_id) ?? [];
      presentations.push({
        id: row.id,
        product_id: row.product_id,
        label,
        input_unit_code: inputUnitCode,
        qty_in_stock_unit: factor,
        last_net_unit_cost: cost?.last_net_unit_cost ?? null,
        avg_net_unit_cost: cost?.avg_net_unit_cost ?? null,
        last_stock_unit_cost: cost?.last_stock_unit_cost ?? null,
        avg_stock_unit_cost: cost?.avg_stock_unit_cost ?? null,
        last_received_at: cost?.last_received_at ?? null,
      });
      missingPresentationsByProductId.set(row.product_id, presentations);
    }

    const missingProducts = ((missingProductsData ?? []) as ProductRow[]).map((product) => {
      const profile = missingProfileByProductId.get(product.id);
      return {
        ...product,
        lot_tracking: Boolean(profile?.lot_tracking),
        expiry_tracking: Boolean(profile?.expiry_tracking),
        supplier_ids: Array.from(missingSupplierIdsByProductId.get(product.id) ?? []),
        presentations: missingPresentationsByProductId.get(product.id) ?? [],
      };
    });

    products = [...products, ...missingProducts];
  }

  const { data: purchaseOrdersData } = await supabase
    .from("purchase_orders")
    .select("id,status,created_at,suppliers(name)")
    .eq("site_id", siteId)
    .in("status", ["draft", "sent"])
    .order("created_at", { ascending: false })
    .limit(200);
  const purchaseOrders = (purchaseOrdersData ?? []) as PurchaseOrderRow[];

  return (
    <div className="w-full space-y-6">
      <div className="ui-panel space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="ui-h1">{correctionEntryId ? "Corregir recepción" : "Nueva recepción"}</h1>
            <p className="ui-body-muted">
              {correctionEntryId ? "Ajusta la recepción original. El sistema reversa la entrada anterior y crea una nueva recepción corregida." : "Registra una entrada de inventario con proveedor, presentación, costo y LOC de destino."}
            </p>
            <div className="mt-2 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
              Sede de recepción: {activeSiteName}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={buildReceiptsUrl({ siteId })} className="ui-btn ui-btn--ghost">
              Ver historial
            </Link>
            <Link href="/purchase-orders" className="ui-btn ui-btn--ghost">
              Ver órdenes de compra
            </Link>
          </div>
        </div>
        {okMsg ? (
          <div className="ui-alert ui-alert--success">
            {okMsg === "corrected" ? "Recepción corregida correctamente." : "Recepción registrada correctamente."}
          </div>
        ) : null}
        {errorMsg ? (
          <div className="ui-alert ui-alert--danger">
            {errorMsg}
          </div>
        ) : null}
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
        selectedPurchaseOrderId={selectedPurchaseOrderIdForForm}
        prefillSupplierId={prefillSupplierId}
        prefillInvoiceNumber={prefillInvoiceNumber}
        prefillNotes={prefillNotes}
        prefillReceivedAt={prefillReceivedAt}
        prefillRows={prefillRows}
        serverErrorMessage={errorMsg}
        submitSuccess={Boolean(okMsg)}
        correctionEntryId={correctionEntryId}
      />

    </div>
  );
}
