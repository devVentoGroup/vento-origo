"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const DELETE_ALLOWED_ROLES = new Set([
  "propietario",
  "gerente",
  "gerente_general",
  "gerente general",
]);

function normalizeRole(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseNum(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(typeof v === "string" ? v.trim() : v);
  return Number.isFinite(n) ? n : null;
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type ProductPresentationRow = {
  id: string;
  product_id: string;
  label: string | null;
  input_unit_code: string | null;
  qty_in_stock_unit: number | null;
  is_active: boolean | null;
  source: string | null;
  usage_context: string | null;
};

type ProductStockRow = {
  id: string;
  unit: string | null;
  stock_unit_code: string | null;
  product_type: string | null;
  is_active: boolean | null;
};

type ProductSupplierRow = {
  product_id: string;
  supplier_id: string;
};

type PurchaseOrderItemInput = {
  product_id: string;
  presentation_id: string;
  quantity_ordered: number;
  unit_cost: number;
  unit: string;
  input_unit_code: string;
  input_unit_label: string;
  conversion_factor_to_stock: number;
  stock_unit_code: string;
  base_quantity_ordered: number;
  stock_unit_cost: number;
  line_total: number;
};

async function buildPurchaseOrderItemsFromForm(params: {
  supabase: SupabaseClient;
  formData: FormData;
  supplierId: string;
  errorHref: string;
}): Promise<PurchaseOrderItemInput[]> {
  const productIds = params.formData.getAll("item_product_id").map((v) => String(v).trim());
  const presentationIds = params.formData
    .getAll("item_presentation_id")
    .map((v) => String(v).trim());
  const qtys = params.formData.getAll("item_quantity").map((v) => parseNum(v));
  const costs = params.formData.getAll("item_unit_cost").map((v) => parseNum(v) ?? 0);

  const requestedPresentationIds = Array.from(new Set(presentationIds.filter(Boolean)));
  const requestedProductIds = Array.from(new Set(productIds.filter(Boolean)));

  if (!requestedPresentationIds.length && productIds.some(Boolean)) {
    redirect(`${params.errorHref}?error=${encodeURIComponent("Cada linea debe tener una presentación aprobada.")}`);
  }

  const [
    { data: presentationRows, error: presentationErr },
    { data: productRows, error: productErr },
    { data: supplierProductRows, error: supplierProductErr },
  ] = await Promise.all([
    requestedPresentationIds.length
      ? params.supabase
        .from("product_uom_profiles")
        .select("id,product_id,label,input_unit_code,qty_in_stock_unit,is_active,source,usage_context")
        .in("id", requestedPresentationIds)
        .eq("is_active", true)
        .eq("source", "manual")
      : Promise.resolve({ data: [] as ProductPresentationRow[], error: null }),
    requestedProductIds.length
      ? params.supabase
        .from("products")
        .select("id,unit,stock_unit_code,product_type,is_active")
        .in("id", requestedProductIds)
        .eq("is_active", true)
        .eq("product_type", "insumo")
      : Promise.resolve({ data: [] as ProductStockRow[], error: null }),
    requestedProductIds.length
      ? params.supabase
        .from("product_suppliers")
        .select("product_id,supplier_id")
        .eq("supplier_id", params.supplierId)
        .in("product_id", requestedProductIds)
      : Promise.resolve({ data: [] as ProductSupplierRow[], error: null }),
  ]);

  if (presentationErr) {
    redirect(`${params.errorHref}?error=${encodeURIComponent(presentationErr.message)}`);
  }

  if (productErr) {
    redirect(`${params.errorHref}?error=${encodeURIComponent(productErr.message)}`);
  }

  if (supplierProductErr) {
    redirect(`${params.errorHref}?error=${encodeURIComponent(supplierProductErr.message)}`);
  }

  const presentationById = new Map(
    ((presentationRows ?? []) as ProductPresentationRow[]).map((row) => [row.id, row])
  );

  const productById = new Map(
    ((productRows ?? []) as ProductStockRow[]).map((row) => [row.id, row])
  );

  const supplierProductIds = new Set(
    ((supplierProductRows ?? []) as ProductSupplierRow[]).map((row) => String(row.product_id ?? "").trim()).filter(Boolean)
  );

  const items: PurchaseOrderItemInput[] = [];

  for (let i = 0; i < productIds.length; i += 1) {
    const productId = productIds[i];
    const presentationId = presentationIds[i];
    const qty = qtys[i];

    if (!productId && (qty == null || qty <= 0)) continue;
    if (!productId || qty == null || qty <= 0) continue;

    if (!presentationId) {
      redirect(`${params.errorHref}?error=${encodeURIComponent("Cada linea debe tener una presentación aprobada.")}`);
    }

    const presentation = presentationById.get(presentationId);

    if (!presentation || presentation.product_id !== productId) {
      redirect(
        `${params.errorHref}?error=${encodeURIComponent(
          "Hay una presentación inválida o que no pertenece al producto seleccionado."
        )}`
      );
    }

    const product = productById.get(productId);

    if (!product || product.is_active === false || String(product.product_type ?? "").trim().toLowerCase() !== "insumo") {
      redirect(`${params.errorHref}?error=${encodeURIComponent("El producto seleccionado no es un insumo activo.")}`);
    }

    if (!supplierProductIds.has(productId)) {
      redirect(
        `${params.errorHref}?error=${encodeURIComponent(
          "El producto seleccionado no esta asociado al proveedor de la orden."
        )}`
      );
    }

    const presentationLabel = String(presentation.label ?? "").trim();
    const stockUnitCode = String(product?.stock_unit_code ?? product?.unit ?? presentation.input_unit_code ?? "un")
      .trim()
      .toLowerCase();
    const inputUnitCode = String(presentation.input_unit_code ?? stockUnitCode)
      .trim()
      .toLowerCase();
    const conversionFactorToStock = Number(presentation.qty_in_stock_unit ?? 0);
    const unitCost = Number(costs[i] ?? 0);

    if (!presentationLabel) {
      redirect(`${params.errorHref}?error=${encodeURIComponent("Hay una presentación sin nombre valido.")}`);
    }

    if (!Number.isFinite(conversionFactorToStock) || conversionFactorToStock <= 0) {
      redirect(
        `${params.errorHref}?error=${encodeURIComponent(
          `La presentación "${presentationLabel}" no tiene equivalencia válida.`
        )}`
      );
    }

    const baseQuantityOrdered = qty * conversionFactorToStock;
    const stockUnitCost = unitCost > 0 ? unitCost / conversionFactorToStock : 0;

    items.push({
      product_id: productId,
      presentation_id: presentationId,
      quantity_ordered: qty,
      unit_cost: unitCost,
      unit: presentationLabel,
      input_unit_code: inputUnitCode || stockUnitCode || "un",
      input_unit_label: presentationLabel,
      conversion_factor_to_stock: conversionFactorToStock,
      stock_unit_code: stockUnitCode || inputUnitCode || "un",
      base_quantity_ordered: baseQuantityOrdered,
      stock_unit_cost: stockUnitCost,
      line_total: qty * unitCost,
    });
  }

  return items;
}

export async function createPurchaseOrder(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) redirect("/login");

  const supplierId = (formData.get("supplier_id") as string)?.trim();
  const siteId = (formData.get("site_id") as string)?.trim();
  if (!supplierId || !siteId) {
    redirect("/purchase-orders/new?error=supplier_site_required");
  }

  const expectedAt = (formData.get("expected_at") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  const items = await buildPurchaseOrderItemsFromForm({
    supabase,
    formData,
    supplierId,
    errorHref: "/purchase-orders/new",
  });

  if (!items.length) {
    redirect("/purchase-orders/new?error=" + encodeURIComponent("Agrega al menos una linea valida."));
  }

  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      supplier_id: supplierId,
      site_id: siteId,
      status: "draft",
      expected_at: expectedAt || null,
      notes: notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (poError || !po) {
    redirect(`/purchase-orders/new?error=${encodeURIComponent(poError?.message ?? "Error al crear")}`);
  }

  const rows = items.map((it) => ({
    purchase_order_id: po.id,
    product_id: it.product_id,
    quantity_ordered: it.quantity_ordered,
    unit_cost: it.unit_cost,
    unit: it.unit,
    input_uom_profile_id: it.presentation_id,
    input_unit_code: it.input_unit_code,
    input_unit_label: it.input_unit_label,
    conversion_factor_to_stock: it.conversion_factor_to_stock,
    stock_unit_code: it.stock_unit_code,
    stock_quantity_ordered: it.base_quantity_ordered,
    stock_unit_cost: it.stock_unit_cost,
    line_total: it.line_total,
  }));

  const { error: itemsError } = await supabase.from("purchase_order_items").insert(rows);
  if (itemsError) {
    redirect(`/purchase-orders/new?error=${encodeURIComponent(itemsError.message)}`);
  }

  const { data: sumRow } = await supabase
    .from("purchase_order_items")
    .select("line_total")
    .eq("purchase_order_id", po.id);
  const total = (sumRow ?? []).reduce((s, r) => s + Number(r.line_total ?? 0), 0);
  await supabase.from("purchase_orders").update({ total_amount: total }).eq("id", po.id);

  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders/${po.id}`);
}

export async function setPurchaseOrderSent(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "sent" })
    .eq("id", id)
    .eq("status", "draft");

  if (error) {
    redirect(`/purchase-orders/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  redirect(`/purchase-orders/${id}`);
}

export async function updatePurchaseOrder(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: poRow } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", id)
    .single();
  if (poRow?.status !== "draft") {
    redirect(`/purchase-orders/${id}?error=only_draft_editable`);
  }

  const supplierId = (formData.get("supplier_id") as string)?.trim();
  const siteId = (formData.get("site_id") as string)?.trim();
  if (!supplierId || !siteId) {
    redirect(`/purchase-orders/${id}/edit?error=supplier_site_required`);
  }

  const expectedAt = (formData.get("expected_at") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  const items = await buildPurchaseOrderItemsFromForm({
    supabase,
    formData,
    supplierId,
    errorHref: `/purchase-orders/${id}/edit`,
  });

  if (!items.length) {
    redirect(`/purchase-orders/${id}/edit?error=${encodeURIComponent("Agrega al menos una linea valida.")}`);
  }

  await supabase
    .from("purchase_orders")
    .update({
      supplier_id: supplierId,
      site_id: siteId,
      expected_at: expectedAt || null,
      notes: notes || null,
    })
    .eq("id", id);

  await supabase.from("purchase_order_items").delete().eq("purchase_order_id", id);

  const rows = items.map((it) => ({
    purchase_order_id: id,
    product_id: it.product_id,
    quantity_ordered: it.quantity_ordered,
    unit_cost: it.unit_cost,
    unit: it.unit,
    input_uom_profile_id: it.presentation_id,
    input_unit_code: it.input_unit_code,
    input_unit_label: it.input_unit_label,
    conversion_factor_to_stock: it.conversion_factor_to_stock,
    stock_unit_code: it.stock_unit_code,
    stock_quantity_ordered: it.base_quantity_ordered,
    stock_unit_cost: it.stock_unit_cost,
    line_total: it.line_total,
  }));

  const { error: itemsError } = await supabase.from("purchase_order_items").insert(rows);
  if (itemsError) {
    redirect(`/purchase-orders/${id}/edit?error=${encodeURIComponent(itemsError.message)}`);
  }

  const { data: sumRow } = await supabase
    .from("purchase_order_items")
    .select("line_total")
    .eq("purchase_order_id", id);
  const total = (sumRow ?? []).reduce((s, r) => s + Number(r.line_total ?? 0), 0);
  await supabase.from("purchase_orders").update({ total_amount: total }).eq("id", id);

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  redirect(`/purchase-orders/${id}`);
}

export async function deletePurchaseOrder(id: string) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) redirect("/login");

  const { data: employee, error: employeeErr } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = normalizeRole(String(employee?.role ?? ""));
  if (employeeErr || !employee || !DELETE_ALLOWED_ROLES.has(role)) {
    redirect(`/purchase-orders/${id}?error=delete_forbidden_role`);
  }

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id,status")
    .eq("id", id)
    .maybeSingle();

  if (poErr || !po) {
    redirect(`/purchase-orders/${id}?error=${encodeURIComponent(poErr?.message ?? "Orden no encontrada")}`);
  }

  if (String(po.status) !== "draft") {
    redirect(`/purchase-orders/${id}?error=only_draft_deletable`);
  }

  const { error: deleteItemsErr } = await supabase
    .from("purchase_order_items")
    .delete()
    .eq("purchase_order_id", id);

  if (deleteItemsErr) {
    redirect(`/purchase-orders/${id}?error=${encodeURIComponent(deleteItemsErr.message)}`);
  }

  const { error: deletePoErr } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", id)
    .eq("status", "draft");

  if (deletePoErr) {
    redirect(`/purchase-orders/${id}?error=${encodeURIComponent(deletePoErr.message)}`);
  }

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  redirect("/purchase-orders");
}
