import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const REVIEW_PERMISSION = "procurement.receipts";
const REVIEW_PATH = "/product-master-review";
const NEXO_BASE_URL =
  process.env.NEXT_PUBLIC_NEXO_URL?.replace(/\/$/, "") ||
  "https://nexo.ventogroup.co";
const ORIGO_BASE_URL = process.env.NEXT_PUBLIC_ORIGO_URL?.replace(/\/$/, "") || "";

type SearchParams = {
  status?: string;
  ok?: string;
  error?: string;
  finalize_entry_id?: string;
  review_request_id?: string;
  product_id?: string;
};

type ReviewStatus = "pending_review" | "approved" | "rejected" | "cancelled";
type RequestKind = "new_product" | "new_presentation";

type ReviewRequestRow = {
  id: string;
  request_kind: RequestKind;
  status: ReviewStatus;
  source_app: string | null;
  source_flow: string | null;
  site_id: string;
  supplier_id: string | null;
  product_id: string | null;
  source_entry_id: string | null;
  source_entry_item_id: string | null;
  line_index: number | null;
  requested_label: string;
  input_unit_code: string | null;
  input_unit_label: string | null;
  conversion_factor_to_stock: number | null;
  stock_unit_code: string | null;
  unit_cost: number | null;
  currency: string | null;
  notes: string | null;
  payload: unknown;
  created_by: string | null;
  created_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  approved_product_id: string | null;
  approved_presentation_id: string | null;
};

type SupplierRow = {
  id: string;
  name: string | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
};

type EntryRow = {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  received_at: string | null;
  created_at: string | null;
};

type EmployeeRow = {
  id: string;
  full_name: string | null;
  name: string | null;
  email: string | null;
};

type ProductUomProfileRow = {
  id: string;
  label: string | null;
  input_unit_code: string | null;
  qty_in_stock_unit: number | null;
  is_active: boolean | null;
};

type PendingEntryRow = {
  id: string;
  site_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  status: string | null;
  purchase_order_id: string | null;
  received_at: string | null;
  created_at: string | null;
};

type PendingEntryItemRow = {
  id: string;
  entry_id: string;
  product_id: string;
  location_id: string | null;
  location_position_id: string | null;
  quantity_declared: number | null;
  quantity_received: number | null;
  unit: string | null;
  input_qty: number | null;
  input_unit_code: string | null;
  conversion_factor_to_stock: number | null;
  stock_unit_code: string | null;
  input_uom_profile_id: string | null;
  input_unit_cost: number | null;
  stock_unit_cost: number | null;
  line_total_cost: number | null;
  tax_included: boolean | null;
  tax_rate: number | null;
  iva_rate: number | null;
  iva_amount: number | null;
  icui_rate: number | null;
  icui_amount: number | null;
  total_tax_rate: number | null;
  cost_input_mode: string | null;
  net_unit_cost: number | null;
  gross_unit_cost: number | null;
  net_total_cost: number | null;
  gross_total_cost: number | null;
  tax_amount: number | null;
  cost_source: string | null;
  currency: string | null;
  purchase_order_item_id: string | null;
  lot_number: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string | null;
};

type SupplierProductCostRow = {
  id: string;
  total_input_qty: number | null;
  total_stock_qty: number | null;
  total_net_cost: number | null;
  total_gross_cost: number | null;
  samples_count: number | null;
};

type FinalizePendingReceiptResult = "not_applicable" | "waiting" | "finalized";

function asText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeDecode(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function normalizeUnitCode(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

function normalizeComparable(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function parsePositiveNumber(value: unknown): number | null {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

function formatDateTimeColombia(value: string | null | undefined): string {
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
  }).format(date);
}

function formatAmount(value: number | null | undefined, currency = "COP"): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: currency || "COP",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatQty(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function statusLabel(status: ReviewStatus): string {
  if (status === "approved") return "Aprobada";
  if (status === "rejected") return "Rechazada";
  if (status === "cancelled") return "Cancelada";
  return "Pendiente";
}

function requestKindLabel(kind: RequestKind): string {
  return kind === "new_presentation" ? "Nueva presentación" : "Nuevo insumo";
}

function buildErrorRedirect(message: string): never {
  redirect(`${REVIEW_PATH}?error=${encodeURIComponent(message)}`);
}

function buildReviewReturnTo(sourceEntryId: string | null): string {
  const search = new URLSearchParams();
  search.set("status", "pending_review");
  if (sourceEntryId) search.set("finalize_entry_id", sourceEntryId);
  const path = `${REVIEW_PATH}?${search.toString()}`;
  return ORIGO_BASE_URL ? `${ORIGO_BASE_URL}${path}` : path;
}

function buildNexoCreateProductUrl(request: ReviewRequestRow): string {
  const url = new URL("/inventory/catalog/new", NEXO_BASE_URL);
  url.searchParams.set("type", "insumo");
  url.searchParams.set("source", "origo_receipt_review");
  url.searchParams.set("review_request_id", request.id);
  url.searchParams.set("suggested_name", request.requested_label);
  url.searchParams.set("return_to", buildReviewReturnTo(request.source_entry_id));
  if (request.source_entry_id) url.searchParams.set("source_entry_id", request.source_entry_id);
  if (request.supplier_id) url.searchParams.set("supplier_id", request.supplier_id);
  if (request.stock_unit_code) url.searchParams.set("stock_unit_code", request.stock_unit_code);
  return url.toString();
}

async function getActionContext(returnTo = REVIEW_PATH) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);

  const [{ data: employee }, { data: settings }] = await Promise.all([
    supabase.from("employees").select("site_id").eq("id", user.id).maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", user.id)
      .maybeSingle(),
  ]);

  const siteId = String(settings?.selected_site_id ?? employee?.site_id ?? "").trim();
  if (!siteId) redirect(`/no-access?reason=no_site&returnTo=${encodeURIComponent(returnTo)}`);

  const { data: canReview, error: permissionError } = await supabase.rpc("has_permission", {
    p_permission_code: "origo.procurement.receipts",
    p_site_id: siteId,
    p_area_id: null,
  });

  if (permissionError || !canReview) {
    redirect(
      `/no-access?reason=no_permission&permission=${encodeURIComponent("origo.procurement.receipts")}&returnTo=${encodeURIComponent(returnTo)}`
    );
  }

  return { supabase, user, siteId };
}

async function loadReviewRequestOrRedirect(params: {
  requestId: string;
  expectedKind?: RequestKind;
  siteId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}): Promise<ReviewRequestRow> {
  if (!params.requestId) buildErrorRedirect("Solicitud requerida.");

  const { data: request, error } = await params.supabase
    .from("product_master_review_requests")
    .select(
      "id,request_kind,status,source_app,source_flow,site_id,supplier_id,product_id,source_entry_id,source_entry_item_id,line_index,requested_label,input_unit_code,input_unit_label,conversion_factor_to_stock,stock_unit_code,unit_cost,currency,notes,payload,created_by,created_at,reviewed_by,reviewed_at,review_notes,approved_product_id,approved_presentation_id"
    )
    .eq("id", params.requestId)
    .maybeSingle();

  if (error) buildErrorRedirect(error.message);
  if (!request) buildErrorRedirect("La solicitud no existe.");

  const row = request as ReviewRequestRow;
  if (row.site_id !== params.siteId) buildErrorRedirect("La solicitud no pertenece a tu sede activa.");
  if (row.status !== "pending_review") buildErrorRedirect("La solicitud ya fue revisada.");
  if (params.expectedKind && row.request_kind !== params.expectedKind) {
    buildErrorRedirect("El tipo de solicitud no coincide con la acción seleccionada.");
  }

  return row;
}
async function fetchPendingEntryItems(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  entryId: string;
}): Promise<PendingEntryItemRow[]> {
  const { data, error } = await params.supabase
    .from("inventory_entry_items")
    .select(
      "id,entry_id,product_id,location_id,location_position_id,quantity_declared,quantity_received,unit,input_qty,input_unit_code,conversion_factor_to_stock,stock_unit_code,input_uom_profile_id,input_unit_cost,stock_unit_cost,line_total_cost,tax_included,tax_rate,iva_rate,iva_amount,icui_rate,icui_amount,total_tax_rate,cost_input_mode,net_unit_cost,gross_unit_cost,net_total_cost,gross_total_cost,tax_amount,cost_source,currency,purchase_order_item_id,lot_number,expiry_date,notes,created_at"
    )
    .eq("entry_id", params.entryId)
    .order("created_at", { ascending: true });

  if (error) buildErrorRedirect(error.message);
  return (data ?? []) as PendingEntryItemRow[];
}

function findEntryItemForRequest(
  request: Pick<ReviewRequestRow, "source_entry_item_id" | "line_index">,
  items: PendingEntryItemRow[]
): PendingEntryItemRow | null {
  if (request.source_entry_item_id) {
    return items.find((item) => item.id === request.source_entry_item_id) ?? null;
  }

  if (typeof request.line_index === "number" && request.line_index >= 0) {
    return items[request.line_index] ?? null;
  }

  return null;
}

async function applyApprovedPresentationToEntryItem(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  request: ReviewRequestRow;
  items: PendingEntryItemRow[];
}) {
  if (!params.request.approved_presentation_id) return;

  const item = findEntryItemForRequest(params.request, params.items);
  if (!item) return;

  const factor = parsePositiveNumber(params.request.conversion_factor_to_stock);
  if (!factor) return;

  const inputQty = Number(item.input_qty ?? 0);
  const safeInputQty = Number.isFinite(inputQty) && inputQty > 0 ? inputQty : 0;
  const quantityReceived = roundQuantity(safeInputQty * factor, 6);
  const netUnitCost = Number(item.net_unit_cost ?? item.input_unit_cost ?? params.request.unit_cost ?? 0);
  const grossUnitCost = Number(item.gross_unit_cost ?? netUnitCost);
  const stockUnitCost = netUnitCost > 0 ? roundQuantity(netUnitCost / factor, 6) : Number(item.stock_unit_cost ?? 0);
  const netTotalCost = Number(item.net_total_cost ?? (safeInputQty > 0 ? safeInputQty * netUnitCost : item.line_total_cost ?? 0));
  const grossTotalCost = Number(item.gross_total_cost ?? (safeInputQty > 0 ? safeInputQty * grossUnitCost : netTotalCost));
  const inputUnitLabel = String(params.request.input_unit_label ?? params.request.requested_label ?? item.unit ?? "").trim();
  const inputUnitCode =
    String(params.request.input_unit_code ?? item.input_unit_code ?? "").trim().toLowerCase() ||
    normalizeUnitCode(inputUnitLabel);
  const stockUnitCode = String(params.request.stock_unit_code ?? item.stock_unit_code ?? "un").trim().toLowerCase() || "un";

  const { error } = await params.supabase
    .from("inventory_entry_items")
    .update({
      input_uom_profile_id: params.request.approved_presentation_id,
      input_unit_code: inputUnitCode,
      unit: inputUnitLabel || inputUnitCode,
      conversion_factor_to_stock: factor,
      stock_unit_code: stockUnitCode,
      quantity_declared: quantityReceived,
      quantity_received: quantityReceived,
      stock_unit_cost: stockUnitCost,
      line_total_cost: netTotalCost,
      net_total_cost: netTotalCost,
      gross_total_cost: grossTotalCost,
    })
    .eq("id", item.id);

  if (error) buildErrorRedirect(error.message);
}


async function applyApprovedProductToEntryItem(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  request: ReviewRequestRow;
  items: PendingEntryItemRow[];
}): Promise<boolean> {
  if (!params.request.approved_product_id) return false;

  const item = findEntryItemForRequest(params.request, params.items);
  if (!item) return false;

  const { data: product, error: productError } = await params.supabase
    .from("products")
    .select("id,unit,stock_unit_code")
    .eq("id", params.request.approved_product_id)
    .maybeSingle();

  if (productError) buildErrorRedirect(productError.message);
  if (!product) return false;

  const productRow = product as { id: string; unit: string | null; stock_unit_code: string | null };
  const stockUnitCode = String(productRow.stock_unit_code ?? productRow.unit ?? item.stock_unit_code ?? "un")
    .trim()
    .toLowerCase() || "un";

  const { error } = await params.supabase
    .from("inventory_entry_items")
    .update({
      product_id: params.request.approved_product_id,
      stock_unit_code: stockUnitCode,
      input_unit_code: item.input_unit_code || stockUnitCode,
      unit: item.unit || item.input_unit_code || stockUnitCode,
    })
    .eq("id", item.id);

  if (error) buildErrorRedirect(error.message);
  return true;
}

async function updateSupplierProductCostsForReceipt(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  supplierId: string | null;
  entry: PendingEntryRow;
  items: PendingEntryItemRow[];
}) {
  if (!params.supplierId) return;

  for (const item of params.items) {
    const inputUomProfileId = String(item.input_uom_profile_id ?? "").trim();
    if (!item.product_id || !inputUomProfileId) continue;

    const inputQty = Math.max(0, Number(item.input_qty ?? 0));
    const stockQty = Math.max(0, Number(item.quantity_received ?? 0));
    const netTotal = Math.max(0, Number(item.net_total_cost ?? item.line_total_cost ?? 0));
    const grossTotal = Math.max(0, Number(item.gross_total_cost ?? netTotal));
    const netUnitCost = Math.max(0, Number(item.net_unit_cost ?? item.input_unit_cost ?? 0));
    const grossUnitCost = Math.max(0, Number(item.gross_unit_cost ?? netUnitCost));
    const stockUnitCost = Math.max(0, Number(item.stock_unit_cost ?? 0));
    const inputUnitCode = String(item.input_unit_code ?? item.stock_unit_code ?? "un").trim().toLowerCase() || "un";
    const inputUnitLabel = String(item.unit ?? inputUnitCode).trim() || inputUnitCode;
    const conversionFactorToStock = Math.max(0, Number(item.conversion_factor_to_stock ?? 1)) || 1;
    const stockUnitCode = String(item.stock_unit_code ?? inputUnitCode).trim().toLowerCase() || inputUnitCode;
    const currency = String(item.currency ?? "COP").trim() || "COP";

    const { data: existingData, error: existingError } = await params.supabase
      .from("procurement_supplier_product_costs")
      .select("id,total_input_qty,total_stock_qty,total_net_cost,total_gross_cost,samples_count")
      .eq("supplier_id", params.supplierId)
      .eq("product_id", item.product_id)
      .eq("input_uom_profile_id", inputUomProfileId)
      .eq("input_unit_code", inputUnitCode)
      .eq("conversion_factor_to_stock", conversionFactorToStock)
      .eq("stock_unit_code", stockUnitCode)
      .eq("currency", currency)
      .eq("is_active", true)
      .maybeSingle();

    if (existingError) buildErrorRedirect(existingError.message);

    const existing = existingData as SupplierProductCostRow | null;
    const totalInputQty = roundQuantity(Number(existing?.total_input_qty ?? 0) + inputQty, 6);
    const totalStockQty = roundQuantity(Number(existing?.total_stock_qty ?? 0) + stockQty, 6);
    const totalNetCost = roundQuantity(Number(existing?.total_net_cost ?? 0) + netTotal, 6);
    const totalGrossCost = roundQuantity(Number(existing?.total_gross_cost ?? 0) + grossTotal, 6);
    const avgNetUnitCost = totalInputQty > 0 ? roundQuantity(totalNetCost / totalInputQty, 6) : 0;
    const avgGrossUnitCost = totalInputQty > 0 ? roundQuantity(totalGrossCost / totalInputQty, 6) : 0;
    const avgStockUnitCost = totalStockQty > 0 ? roundQuantity(totalNetCost / totalStockQty, 6) : 0;
    const samplesCount = Number(existing?.samples_count ?? 0) + 1;

    const payload = {
      supplier_id: params.supplierId,
      product_id: item.product_id,
      input_uom_profile_id: inputUomProfileId,
      input_unit_code: inputUnitCode,
      input_unit_label: inputUnitLabel,
      conversion_factor_to_stock: conversionFactorToStock,
      stock_unit_code: stockUnitCode,
      currency,
      last_net_unit_cost: roundQuantity(netUnitCost, 6),
      last_gross_unit_cost: roundQuantity(grossUnitCost, 6),
      last_stock_unit_cost: roundQuantity(stockUnitCost, 6),
      avg_net_unit_cost: avgNetUnitCost,
      avg_gross_unit_cost: avgGrossUnitCost,
      avg_stock_unit_cost: avgStockUnitCost,
      total_input_qty: totalInputQty,
      total_stock_qty: totalStockQty,
      total_net_cost: totalNetCost,
      total_gross_cost: totalGrossCost,
      samples_count: samplesCount,
      last_entry_id: params.entry.id,
      last_entry_item_id: item.id,
      last_received_at: params.entry.received_at ?? params.entry.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true,
    };

    if (existing?.id) {
      const { error: updateError } = await params.supabase
        .from("procurement_supplier_product_costs")
        .update(payload)
        .eq("id", existing.id);
      if (updateError) buildErrorRedirect(updateError.message);
    } else {
      const { error: insertError } = await params.supabase
        .from("procurement_supplier_product_costs")
        .insert(payload);
      if (insertError) buildErrorRedirect(insertError.message);
    }
  }
}

async function finalizePendingReceiptIfReady(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  siteId: string;
  sourceEntryId: string | null;
}): Promise<FinalizePendingReceiptResult> {
  if (!params.sourceEntryId) return "not_applicable";

  const { data: entryData, error: entryError } = await params.supabase
    .from("inventory_entries")
    .select("id,site_id,supplier_id,supplier_name,status,purchase_order_id,received_at,created_at")
    .eq("id", params.sourceEntryId)
    .maybeSingle();

  if (entryError) buildErrorRedirect(entryError.message);
  if (!entryData) return "not_applicable";

  const entry = entryData as PendingEntryRow;
  if (entry.site_id !== params.siteId) buildErrorRedirect("La recepción pendiente no pertenece a tu sede activa.");
  if (entry.status !== "pending_review") return "not_applicable";

  const { data: requestData, error: requestError } = await params.supabase
    .from("product_master_review_requests")
    .select(
      "id,request_kind,status,source_app,source_flow,site_id,supplier_id,product_id,source_entry_id,source_entry_item_id,line_index,requested_label,input_unit_code,input_unit_label,conversion_factor_to_stock,stock_unit_code,unit_cost,currency,notes,payload,created_by,created_at,reviewed_by,reviewed_at,review_notes,approved_product_id,approved_presentation_id"
    )
    .eq("source_entry_id", entry.id)
    .eq("source_app", "origo")
    .eq("source_flow", "receipt");

  if (requestError) buildErrorRedirect(requestError.message);

  const requests = (requestData ?? []) as ReviewRequestRow[];
  if (!requests.length) return "not_applicable";

  if (requests.some((request) => request.status === "pending_review")) return "waiting";
  if (requests.some((request) => request.status !== "approved")) return "waiting";
  if (requests.some((request) => request.request_kind === "new_presentation" && !request.approved_presentation_id)) return "waiting";
  if (requests.some((request) => request.request_kind === "new_product" && !request.approved_product_id)) return "waiting";

  let items = await fetchPendingEntryItems({ supabase: params.supabase, entryId: entry.id });
  if (!items.length) return "waiting";

  for (const request of requests) {
    if (request.request_kind === "new_product") {
      const applied = await applyApprovedProductToEntryItem({ supabase: params.supabase, request, items });
      if (!applied) return "waiting";
    }
  }

  items = await fetchPendingEntryItems({ supabase: params.supabase, entryId: entry.id });

  for (const request of requests) {
    if (request.request_kind !== "new_presentation") continue;
    await applyApprovedPresentationToEntryItem({ supabase: params.supabase, request, items });
  }

  items = await fetchPendingEntryItems({ supabase: params.supabase, entryId: entry.id });

  const incompleteItem = items.some((item) => {
    const qty = Number(item.quantity_received ?? 0);
    return !item.product_id || !item.location_id || !Number.isFinite(qty) || qty <= 0 || !item.input_uom_profile_id;
  });
  if (incompleteItem) return "waiting";

  const movementRows = items.map((item) => ({
    site_id: entry.site_id,
    product_id: item.product_id,
    location_id: item.location_id,
    location_position_id: item.location_position_id,
    movement_type: "receipt_in",
    quantity: item.quantity_received,
    input_qty: item.input_qty,
    input_unit_code: item.input_unit_code,
    conversion_factor_to_stock: item.conversion_factor_to_stock,
    stock_unit_code: item.stock_unit_code,
    input_uom_profile_id: item.input_uom_profile_id,
    stock_unit_cost: item.stock_unit_cost,
    line_total_cost: item.line_total_cost,
    related_purchase_order_id: entry.purchase_order_id,
    note: `Recepcion ORIGO ${entry.id}`,
  }));

  const { error: movementError } = await params.supabase.from("inventory_movements").insert(movementRows);
  if (movementError) buildErrorRedirect(movementError.message);

  const productIdsWithReceipt = Array.from(new Set(items.map((item) => item.product_id).filter(Boolean)));
  const { data: globalStockRows } = await params.supabase
    .from("inventory_stock_by_site")
    .select("product_id,current_qty")
    .in("product_id", productIdsWithReceipt);
  const globalQtyBeforeMap = new Map<string, number>();
  for (const row of (globalStockRows ?? []) as Array<{ product_id: string; current_qty: number | null }>) {
    const previous = globalQtyBeforeMap.get(row.product_id) ?? 0;
    globalQtyBeforeMap.set(row.product_id, previous + Number(row.current_qty ?? 0));
  }

  const { data: existingSiteStocks } = await params.supabase
    .from("inventory_stock_by_site")
    .select("product_id,current_qty")
    .eq("site_id", entry.site_id)
    .in("product_id", productIdsWithReceipt);
  const siteQtyMap = new Map(
    ((existingSiteStocks ?? []) as Array<{ product_id: string; current_qty: number | null }>).map((row) => [
      row.product_id,
      Number(row.current_qty ?? 0),
    ])
  );

  for (const item of items) {
    const currentQty = siteQtyMap.get(item.product_id) ?? 0;
    const nextQty = roundQuantity(currentQty + Number(item.quantity_received ?? 0));
    siteQtyMap.set(item.product_id, nextQty);
    const { error: stockError } = await params.supabase
      .from("inventory_stock_by_site")
      .upsert(
        {
          site_id: entry.site_id,
          product_id: item.product_id,
          current_qty: nextQty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "site_id,product_id" }
      );
    if (stockError) buildErrorRedirect(stockError.message);
  }

  for (const item of items) {
    const { error: locationError } = await params.supabase.rpc("upsert_inventory_stock_by_location", {
      p_location_id: item.location_id,
      p_product_id: item.product_id,
      p_delta: item.quantity_received,
    });
    if (locationError) buildErrorRedirect(locationError.message);
  }

  const { data: profileRowsData } = await params.supabase
    .from("product_inventory_profiles")
    .select("product_id,track_inventory,costing_mode")
    .in("product_id", productIdsWithReceipt);
  const profileMap = new Map(
    ((profileRowsData ?? []) as Array<{ product_id: string; track_inventory: boolean | null; costing_mode: string | null }>).map((row) => [
      row.product_id,
      row,
    ])
  );

  const { data: productRowsData } = await params.supabase
    .from("products")
    .select("id,cost")
    .in("id", productIdsWithReceipt);
  const productCostMap = new Map(
    ((productRowsData ?? []) as Array<{ id: string; cost: number | null }>).map((row) => [row.id, Number(row.cost ?? 0)])
  );

  const { data: policyRow } = await params.supabase
    .from("inventory_cost_policies")
    .select("cost_basis,is_active")
    .eq("site_id", entry.site_id)
    .maybeSingle();
  const basis =
    policyRow && policyRow.is_active === false
      ? "net"
      : (String(policyRow?.cost_basis ?? "net") as "net" | "gross");

  const receiptByProduct = new Map<string, { qtyIn: number; lineCostTotal: number; applyAutoCost: boolean }>();
  for (const item of items) {
    const profile = profileMap.get(item.product_id);
    const previous = receiptByProduct.get(item.product_id) ?? {
      qtyIn: 0,
      lineCostTotal: 0,
      applyAutoCost: false,
    };
    receiptByProduct.set(item.product_id, {
      qtyIn: previous.qtyIn + Number(item.quantity_received ?? 0),
      lineCostTotal: previous.lineCostTotal + Number(item.line_total_cost ?? item.net_total_cost ?? 0),
      applyAutoCost:
        previous.applyAutoCost || (Boolean(profile?.track_inventory) && profile?.costing_mode === "auto_primary_supplier"),
    });
  }

  for (const [productId, receipt] of receiptByProduct.entries()) {
    if (!receipt.applyAutoCost || receipt.qtyIn <= 0) continue;

    const costBefore = Number(productCostMap.get(productId) ?? 0);
    const qtyBefore = Number(globalQtyBeforeMap.get(productId) ?? 0);
    const costIn = receipt.qtyIn > 0 ? receipt.lineCostTotal / receipt.qtyIn : 0;
    const costAfter = computeWeightedAverageCost({
      currentQty: qtyBefore,
      currentUnitCost: costBefore,
      receivedQty: receipt.qtyIn,
      receivedUnitCost: costIn,
    });

    const { error: productCostError } = await params.supabase
      .from("products")
      .update({ cost: costAfter, updated_at: new Date().toISOString() })
      .eq("id", productId);
    if (productCostError) buildErrorRedirect(productCostError.message);

    const { error: costEventError } = await params.supabase.from("product_cost_events").insert({
      product_id: productId,
      site_id: entry.site_id,
      source: "entry",
      source_entry_id: entry.id,
      qty_before: qtyBefore,
      qty_in: receipt.qtyIn,
      cost_before: costBefore,
      cost_in: costIn,
      cost_after: costAfter,
      basis,
      created_by: params.userId,
    });
    if (costEventError) buildErrorRedirect(costEventError.message);
  }

  await updateSupplierProductCostsForReceipt({
    supabase: params.supabase,
    supplierId: entry.supplier_id,
    entry,
    items,
  });

  if (entry.purchase_order_id) {
    const receivedByPoItem = new Map<string, number>();
    for (const item of items) {
      if (!item.purchase_order_item_id) continue;
      const previous = receivedByPoItem.get(item.purchase_order_item_id) ?? 0;
      receivedByPoItem.set(item.purchase_order_item_id, previous + Number(item.input_qty ?? 0));
    }

    for (const [poItemId, qtyReceived] of receivedByPoItem.entries()) {
      const { data: poItem, error: poItemError } = await params.supabase
        .from("purchase_order_items")
        .select("quantity_received")
        .eq("id", poItemId)
        .maybeSingle();
      if (poItemError) buildErrorRedirect(poItemError.message);

      const currentReceived = Number(poItem?.quantity_received ?? 0);
      const nextReceived = roundQuantity(currentReceived + qtyReceived, 6);
      const { error: poItemUpdateError } = await params.supabase
        .from("purchase_order_items")
        .update({ quantity_received: nextReceived })
        .eq("id", poItemId);
      if (poItemUpdateError) buildErrorRedirect(poItemUpdateError.message);
    }

    const { data: poAllItems, error: poItemsError } = await params.supabase
      .from("purchase_order_items")
      .select("quantity_ordered,quantity_received")
      .eq("purchase_order_id", entry.purchase_order_id);
    if (poItemsError) buildErrorRedirect(poItemsError.message);

    const allPurchaseOrderItems = (poAllItems ?? []) as Array<{
      quantity_ordered: number | null;
      quantity_received: number | null;
    }>;
    const allReceived = allPurchaseOrderItems.every((row) => {
      const ordered = Number(row.quantity_ordered ?? 0);
      const received = Number(row.quantity_received ?? 0);
      return ordered > 0 && received >= ordered;
    });

    if (allReceived && allPurchaseOrderItems.length > 0) {
      const { error: poStatusError } = await params.supabase
        .from("purchase_orders")
        .update({ status: "received", received_at: new Date().toISOString() })
        .eq("id", entry.purchase_order_id);
      if (poStatusError) buildErrorRedirect(poStatusError.message);
    }
  }

  const { error: entryStatusError } = await params.supabase
    .from("inventory_entries")
    .update({ status: "received", updated_at: new Date().toISOString() })
    .eq("id", entry.id)
    .eq("status", "pending_review");

  if (entryStatusError) buildErrorRedirect(entryStatusError.message);

  return "finalized";
}

export async function approvePresentationRequest(formData: FormData) {
  "use server";

  const requestId = asText(formData.get("request_id"));
  const reviewNotes = asText(formData.get("review_notes"));
  const { supabase, user, siteId } = await getActionContext();

  const request = await loadReviewRequestOrRedirect({
    requestId,
    expectedKind: "new_presentation",
    siteId,
    supabase,
  });

  if (!request.product_id) buildErrorRedirect("La solicitud de presentación no tiene producto asociado.");

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id,unit,stock_unit_code")
    .eq("id", request.product_id)
    .maybeSingle();

  if (productError) buildErrorRedirect(productError.message);
  if (!product) buildErrorRedirect("El producto asociado ya no existe.");

  const requestedLabel = String(request.requested_label ?? "").trim();
  const inputUnitLabel = String(request.input_unit_label ?? request.requested_label ?? "").trim();
  const inputUnitCode =
    String(request.input_unit_code ?? "").trim().toLowerCase() || normalizeUnitCode(inputUnitLabel || requestedLabel);
  const factor = parsePositiveNumber(request.conversion_factor_to_stock);
  const stockUnitCode =
    String(request.stock_unit_code ?? product.stock_unit_code ?? product.unit ?? "un").trim().toLowerCase() || "un";

  if (!requestedLabel) buildErrorRedirect("La solicitud no tiene nombre de presentación.");
  if (!inputUnitCode) buildErrorRedirect("La solicitud no tiene unidad de entrada válida.");
  if (!factor) buildErrorRedirect("La solicitud no tiene factor a stock válido.");

  const { data: existingProfilesData, error: profilesError } = await supabase
    .from("product_uom_profiles")
    .select("id,label,input_unit_code,qty_in_stock_unit,is_active")
    .eq("product_id", request.product_id)
    .eq("is_active", true);

  if (profilesError) buildErrorRedirect(profilesError.message);

  const existingProfiles = (existingProfilesData ?? []) as ProductUomProfileRow[];
  const duplicate = existingProfiles.find((profile) => {
    const sameLabel = normalizeComparable(profile.label) === normalizeComparable(requestedLabel);
    const sameUnit = normalizeComparable(profile.input_unit_code) === normalizeComparable(inputUnitCode);
    const sameFactor = Number(profile.qty_in_stock_unit ?? 0) === factor;
    return sameLabel || (sameUnit && sameFactor);
  });

  if (duplicate) {
    const { error: updateDuplicateError } = await supabase
      .from("product_master_review_requests")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_notes:
          reviewNotes ||
          `Aprobada usando una presentación existente: ${String(duplicate.label ?? duplicate.id).trim()}.`,
        approved_presentation_id: duplicate.id,
      })
      .eq("id", request.id);

    if (updateDuplicateError) buildErrorRedirect(updateDuplicateError.message);

    const finalizeResult = await finalizePendingReceiptIfReady({
      supabase,
      userId: user.id,
      siteId,
      sourceEntryId: request.source_entry_id,
    });

    revalidatePath(REVIEW_PATH);
    redirect(
      `${REVIEW_PATH}?ok=${encodeURIComponent(
        finalizeResult === "finalized" ? "presentation_existing_receipt_finalized" : "presentation_existing"
      )}`
    );
  }

  const { data: presentation, error: insertError } = await supabase
    .from("product_uom_profiles")
    .insert({
      product_id: request.product_id,
      label: requestedLabel,
      input_unit_code: inputUnitCode,
      qty_in_stock_unit: factor,
      is_active: true,
      source: "manual",
      usage_context: "general",
    })
    .select("id")
    .single();

  if (insertError || !presentation) {
    buildErrorRedirect(insertError?.message ?? "No se pudo crear la presentación.");
  }

  const { error: updateError } = await supabase
    .from("product_master_review_requests")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: reviewNotes || null,
      approved_presentation_id: presentation.id,
    })
    .eq("id", request.id);

  if (updateError) buildErrorRedirect(updateError.message);

  const finalizeResult = await finalizePendingReceiptIfReady({
    supabase,
    userId: user.id,
    siteId,
    sourceEntryId: request.source_entry_id,
  });

  revalidatePath(REVIEW_PATH);
  redirect(
    `${REVIEW_PATH}?ok=${encodeURIComponent(
      finalizeResult === "finalized" ? "presentation_approved_receipt_finalized" : "presentation_approved"
    )}`
  );
}

export async function approveNewProductRequest(formData: FormData) {
  "use server";

  const requestId = asText(formData.get("request_id"));
  const reviewNotes = asText(formData.get("review_notes"));
  const { supabase, user, siteId } = await getActionContext();

  const request = await loadReviewRequestOrRedirect({
    requestId,
    expectedKind: "new_product",
    siteId,
    supabase,
  });

  const { error } = await supabase
    .from("product_master_review_requests")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes:
        reviewNotes ||
        "Solicitud aprobada para completar/crear el producto desde el catálogo maestro en NEXO.",
    })
    .eq("id", request.id);

  if (error) buildErrorRedirect(error.message);

  const finalizeResult = await finalizePendingReceiptIfReady({
    supabase,
    userId: user.id,
    siteId,
    sourceEntryId: request.source_entry_id,
  });

  revalidatePath(REVIEW_PATH);
  redirect(
    `${REVIEW_PATH}?ok=${encodeURIComponent(
      finalizeResult === "finalized" ? "product_request_approved_receipt_finalized" : "product_request_approved"
    )}`
  );
}

export async function rejectReviewRequest(formData: FormData) {
  "use server";

  const requestId = asText(formData.get("request_id"));
  const reviewNotes = asText(formData.get("review_notes"));
  const { supabase, user, siteId } = await getActionContext();

  const request = await loadReviewRequestOrRedirect({
    requestId,
    siteId,
    supabase,
  });

  const { error } = await supabase
    .from("product_master_review_requests")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: reviewNotes || "Solicitud rechazada desde revisión de recepciones ORIGO.",
    })
    .eq("id", request.id);

  if (error) buildErrorRedirect(error.message);

  revalidatePath(REVIEW_PATH);
  redirect(`${REVIEW_PATH}?ok=${encodeURIComponent("request_rejected")}`);
}

function getEmployeeLabel(employee: EmployeeRow | undefined): string {
  if (!employee) return "-";
  return employee.full_name || employee.name || employee.email || employee.id;
}

function getPayloadValue(payload: unknown, key: string): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function buildStatusClass(status: ReviewStatus): string {
  if (status === "approved") return "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800";
  if (status === "rejected") return "rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-800";
  if (status === "cancelled") return "rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700";
  return "rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800";
}

function buildKindClass(kind: RequestKind): string {
  if (kind === "new_presentation") return "rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800";
  return "rounded-full bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800";
}

export default async function ProductMasterReviewPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedStatus = String(sp.status ?? "pending_review").trim();
  const statusFilter: ReviewStatus | "all" = ["pending_review", "approved", "rejected", "cancelled", "all"].includes(
    requestedStatus
  )
    ? (requestedStatus as ReviewStatus | "all")
    : "pending_review";
  const okMsg = safeDecode(sp.ok);
  const errorMsg = safeDecode(sp.error);

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: REVIEW_PATH,
    permissionCode: REVIEW_PERMISSION,
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
  if (!siteId) redirect(`/no-access?reason=no_site&returnTo=${encodeURIComponent(REVIEW_PATH)}`);

  const finalizeEntryId = String(sp.finalize_entry_id ?? "").trim();
  if (finalizeEntryId) {
    const finalizeResult = await finalizePendingReceiptIfReady({
      supabase,
      userId: user.id,
      siteId,
      sourceEntryId: finalizeEntryId,
    });
    redirect(
      `${REVIEW_PATH}?status=pending_review&ok=${encodeURIComponent(
        finalizeResult === "finalized" ? "product_created_from_nexo_receipt_finalized" : "product_created_from_nexo_waiting"
      )}`
    );
  }

  let requestsQuery = supabase
    .from("product_master_review_requests")
    .select(
      "id,request_kind,status,source_app,source_flow,site_id,supplier_id,product_id,source_entry_id,source_entry_item_id,line_index,requested_label,input_unit_code,input_unit_label,conversion_factor_to_stock,stock_unit_code,unit_cost,currency,notes,payload,created_by,created_at,reviewed_by,reviewed_at,review_notes,approved_product_id,approved_presentation_id"
    )
    .eq("site_id", siteId)
    .eq("source_app", "origo")
    .eq("source_flow", "receipt")
    .order("created_at", { ascending: false })
    .limit(150);

  if (statusFilter !== "all") {
    requestsQuery = requestsQuery.eq("status", statusFilter);
  }

  const { data: requestRowsData, error: requestsError } = await requestsQuery;
  const requestRows = (requestRowsData ?? []) as ReviewRequestRow[];

  const supplierIds = Array.from(new Set(requestRows.map((row) => row.supplier_id).filter((id): id is string => Boolean(id))));
  const productIds = Array.from(new Set(requestRows.map((row) => row.product_id).filter((id): id is string => Boolean(id))));
  const entryIds = Array.from(new Set(requestRows.map((row) => row.source_entry_id).filter((id): id is string => Boolean(id))));
  const employeeIds = Array.from(
    new Set(
      requestRows
        .flatMap((row) => [row.created_by, row.reviewed_by])
        .filter((id): id is string => Boolean(id))
    )
  );

  const [suppliersRes, productsRes, entriesRes, employeesRes] = await Promise.all([
    supplierIds.length
      ? supabase.from("suppliers").select("id,name").in("id", supplierIds)
      : Promise.resolve({ data: [] as SupplierRow[], error: null }),
    productIds.length
      ? supabase.from("products").select("id,name,unit,stock_unit_code").in("id", productIds)
      : Promise.resolve({ data: [] as ProductRow[], error: null }),
    entryIds.length
      ? supabase.from("inventory_entries").select("id,supplier_name,invoice_number,received_at,created_at").in("id", entryIds)
      : Promise.resolve({ data: [] as EntryRow[], error: null }),
    employeeIds.length
      ? supabase.from("employees").select("id,full_name,name,email").in("id", employeeIds)
      : Promise.resolve({ data: [] as EmployeeRow[], error: null }),
  ]);

  const supplierById = new Map(((suppliersRes.data ?? []) as SupplierRow[]).map((row) => [row.id, row]));
  const productById = new Map(((productsRes.data ?? []) as ProductRow[]).map((row) => [row.id, row]));
  const entryById = new Map(((entriesRes.data ?? []) as EntryRow[]).map((row) => [row.id, row]));
  const employeeById = new Map(((employeesRes.data ?? []) as EmployeeRow[]).map((row) => [row.id, row]));

  const counts = requestRows.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.request_kind] += 1;
      return acc;
    },
    { total: 0, new_product: 0, new_presentation: 0 }
  );

  return (
    <div className="w-full space-y-6">
      <div className="ui-panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-caption">ORIGO · Recepciones</div>
            <h1 className="ui-h1">Revisión de solicitudes desde recepción</h1>
            <p className="ui-body-muted mt-1 max-w-4xl">
              Bandeja exclusiva para solicitudes levantadas durante una recepción. No reemplaza el catálogo maestro de NEXO: los productos nuevos se aprueban como solicitud para completar en catálogo; las presentaciones de productos existentes sí pueden materializarse aquí como presentación manual aprobada.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/receipts" className="ui-btn ui-btn--ghost">
              Volver a recepciones
            </Link>
          </div>
        </div>

        {errorMsg ? <div className="ui-alert ui-alert--danger">{errorMsg}</div> : null}
        {okMsg ? (
          <div className="ui-alert ui-alert--success">
            {okMsg === "presentation_approved_receipt_finalized"
              ? "Presentación aprobada y recepción pendiente materializada."
              : okMsg === "presentation_existing_receipt_finalized"
                ? "Solicitud aprobada usando una presentación existente y recepción pendiente materializada."
                : okMsg === "product_created_from_nexo_receipt_finalized"
                  ? "Producto creado en NEXO, solicitud aprobada y recepción pendiente materializada."
                  : okMsg === "product_created_from_nexo_waiting"
                    ? "Producto creado en NEXO y solicitud aprobada. La recepción sigue pendiente si faltan otras solicitudes o datos de línea."
                    : okMsg === "product_request_approved_receipt_finalized"
                      ? "Solicitud de producto aprobada y recepción pendiente materializada."
                      : okMsg === "presentation_approved"
                        ? "Presentación aprobada y creada como manual. La recepción sigue pendiente si quedan solicitudes sin resolver."
                        : okMsg === "presentation_existing"
                          ? "Solicitud aprobada usando una presentación existente. La recepción sigue pendiente si quedan solicitudes sin resolver."
                          : okMsg === "product_request_approved"
                            ? "Solicitud de producto aprobada para completar en catálogo maestro. La recepción sigue pendiente hasta vincular el producto real."
                            : okMsg === "request_rejected"
                              ? "Solicitud rechazada."
                              : "Acción completada."}
          </div>
        ) : null}

        {requestsError ? (
          <div className="ui-alert ui-alert--danger">
            No se pudo cargar la bandeja. Verifica que la migración de `product_master_review_requests` esté aplicada. Detalle: {requestsError.message}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Solicitudes</div>
            <div className="mt-1 text-3xl font-bold text-[var(--ui-text)]">{counts.total}</div>
          </div>
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Nuevos insumos</div>
            <div className="mt-1 text-3xl font-bold text-[var(--ui-text)]">{counts.new_product}</div>
          </div>
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Nuevas presentaciones</div>
            <div className="mt-1 text-3xl font-bold text-[var(--ui-text)]">{counts.new_presentation}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ["pending_review", "Pendientes"],
            ["approved", "Aprobadas"],
            ["rejected", "Rechazadas"],
            ["all", "Todas"],
          ].map(([value, label]) => (
            <Link
              key={value}
              href={`${REVIEW_PATH}?status=${value}`}
              className={
                statusFilter === value
                  ? "rounded-full bg-[var(--ui-brand)] px-3 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-[var(--ui-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ui-muted)]"
              }
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {requestRows.map((request) => {
          const supplier = request.supplier_id ? supplierById.get(request.supplier_id) : undefined;
          const product = request.product_id ? productById.get(request.product_id) : undefined;
          const entry = request.source_entry_id ? entryById.get(request.source_entry_id) : undefined;
          const createdBy = request.created_by ? employeeById.get(request.created_by) : undefined;
          const reviewedBy = request.reviewed_by ? employeeById.get(request.reviewed_by) : undefined;
          const payloadProductName = getPayloadValue(request.payload, "productName");
          const productName = product?.name ?? payloadProductName;
          const stockUnitCode = request.stock_unit_code ?? product?.stock_unit_code ?? product?.unit ?? "un";

          return (
            <section key={request.id} className="rounded-[1.75rem] border border-[var(--ui-border)] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className={buildKindClass(request.request_kind)}>{requestKindLabel(request.request_kind)}</span>
                    <span className={buildStatusClass(request.status)}>{statusLabel(request.status)}</span>
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-[var(--ui-text)]">{request.requested_label}</h2>
                  <p className="mt-1 text-sm text-[var(--ui-muted)]">
                    Solicitud creada desde recepción ORIGO el {formatDateTimeColombia(request.created_at)}.
                  </p>
                </div>

                {entry ? (
                  <Link href="/receipts" className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs font-semibold text-[var(--ui-muted)]">
                    Recepción: {entry.invoice_number || entry.id.slice(0, 8)}
                  </Link>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Proveedor contexto</div>
                  <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                    {(supplier?.name ?? entry?.supplier_name ?? getPayloadValue(request.payload, "supplierName")) || "-"}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Producto</div>
                  <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                    {request.request_kind === "new_product" ? "Producto nuevo solicitado" : productName || "-"}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Presentación / factor</div>
                  <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                    {request.request_kind === "new_presentation"
                      ? `${request.input_unit_label ?? request.input_unit_code ?? request.requested_label} · 1 = ${formatQty(request.conversion_factor_to_stock)} ${stockUnitCode}`
                      : "Se completa en catálogo maestro"}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Costo referencia</div>
                  <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                    {request.unit_cost && request.unit_cost > 0 ? formatAmount(request.unit_cost, request.currency ?? "COP") : "-"}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-3 text-sm">
                  <div className="font-semibold text-[var(--ui-text)]">Solicitante</div>
                  <div className="mt-1 text-[var(--ui-muted)]">{getEmployeeLabel(createdBy)}</div>
                </div>
                <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-3 text-sm">
                  <div className="font-semibold text-[var(--ui-text)]">Línea recepción</div>
                  <div className="mt-1 text-[var(--ui-muted)]">
                    {typeof request.line_index === "number" ? `Línea ${request.line_index + 1}` : "-"}
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-3 text-sm">
                  <div className="font-semibold text-[var(--ui-text)]">Recepción origen</div>
                  <div className="mt-1 text-[var(--ui-muted)]">
                    {entry ? `${entry.invoice_number || entry.id.slice(0, 8)} · ${formatDateTimeColombia(entry.received_at ?? entry.created_at)}` : "-"}
                  </div>
                </div>
              </div>

              {request.notes ? (
                <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
                  <div className="font-semibold">Notas de solicitud</div>
                  <p className="mt-1 whitespace-pre-wrap">{request.notes}</p>
                </div>
              ) : null}

              {request.status === "pending_review" ? (
                <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                  {request.request_kind === "new_product" ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="text-sm font-bold text-emerald-950">Crear insumo en NEXO</div>
                      <p className="mt-1 text-xs leading-5 text-emerald-900">
                        Abre el catálogo maestro de NEXO con esta solicitud precargada. Al guardar el producto, NEXO vuelve aquí y aprueba la solicitud con el producto real vinculado.
                      </p>
                      <a href={buildNexoCreateProductUrl(request)} className="ui-btn ui-btn--brand mt-3 inline-flex">
                        Crear en NEXO
                      </a>
                    </div>
                  ) : (
                    <form action={approvePresentationRequest} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <input type="hidden" name="request_id" value={request.id} />
                      <div className="text-sm font-bold text-emerald-950">Aprobar presentación</div>
                      <p className="mt-1 text-xs leading-5 text-emerald-900">
                        Crea una presentación manual en product_uom_profiles para este producto existente.
                      </p>
                      <label className="mt-3 block">
                        <span className="ui-label">Nota de revisión</span>
                        <textarea name="review_notes" className="ui-input mt-1 min-h-20 bg-white" placeholder="Opcional" />
                      </label>
                      <button type="submit" className="ui-btn ui-btn--brand mt-3">
                        Aprobar y crear presentación
                      </button>
                    </form>
                  )}

                  <form action={rejectReviewRequest} className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <input type="hidden" name="request_id" value={request.id} />
                    <div className="text-sm font-bold text-rose-950">Rechazar</div>
                    <p className="mt-1 text-xs leading-5 text-rose-900">
                      Rechaza la solicitud y deja trazabilidad para quien la levantó desde recepción.
                    </p>
                    <label className="mt-3 block">
                      <span className="ui-label">Motivo</span>
                      <textarea
                        name="review_notes"
                        className="ui-input mt-1 min-h-20 bg-white"
                        placeholder="Ej: ya existe, factor incorrecto, falta información"
                      />
                    </label>
                    <button type="submit" className="ui-btn ui-btn--ghost mt-3 border-rose-200 text-rose-700">
                      Rechazar solicitud
                    </button>
                  </form>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 text-sm">
                  <div className="font-semibold text-[var(--ui-text)]">
                    Revisada por {getEmployeeLabel(reviewedBy)} el {formatDateTimeColombia(request.reviewed_at)}
                  </div>
                  {request.review_notes ? <p className="mt-1 whitespace-pre-wrap text-[var(--ui-muted)]">{request.review_notes}</p> : null}
                  {request.approved_presentation_id ? (
                    <p className="mt-1 text-xs text-[var(--ui-muted)]">Presentación aprobada: {request.approved_presentation_id}</p>
                  ) : null}
                </div>
              )}
            </section>
          );
        })}

        {!requestRows.length ? (
          <div className="ui-panel py-10 text-center text-[var(--ui-muted)]">
            No hay solicitudes para el filtro seleccionado.
          </div>
        ) : null}
      </div>
    </div>
  );
}
