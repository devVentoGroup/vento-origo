import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const REVIEW_PERMISSION = "procurement.receipts";
const REVIEW_PATH = "/product-master-review";

type SearchParams = {
  status?: string;
  ok?: string;
  error?: string;
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
    revalidatePath(REVIEW_PATH);
    redirect(`${REVIEW_PATH}?ok=${encodeURIComponent("presentation_existing")}`);
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

  revalidatePath(REVIEW_PATH);
  redirect(`${REVIEW_PATH}?ok=${encodeURIComponent("presentation_approved")}`);
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

  revalidatePath(REVIEW_PATH);
  redirect(`${REVIEW_PATH}?ok=${encodeURIComponent("product_request_approved")}`);
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
            {okMsg === "presentation_approved"
              ? "Presentación aprobada y creada como manual."
              : okMsg === "presentation_existing"
                ? "Solicitud aprobada usando una presentación existente."
                : okMsg === "product_request_approved"
                  ? "Solicitud de producto aprobada para completar en catálogo maestro."
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
                  <form
                    action={request.request_kind === "new_presentation" ? approvePresentationRequest : approveNewProductRequest}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
                  >
                    <input type="hidden" name="request_id" value={request.id} />
                    <div className="text-sm font-bold text-emerald-950">
                      {request.request_kind === "new_presentation"
                        ? "Aprobar presentación"
                        : "Aprobar solicitud de nuevo insumo"}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-emerald-900">
                      {request.request_kind === "new_presentation"
                        ? "Crea una presentación manual en product_uom_profiles para este producto existente."
                        : "No crea el producto aquí. Marca la solicitud como aprobada para completar la ficha desde el catálogo maestro de NEXO."}
                    </p>
                    <label className="mt-3 block">
                      <span className="ui-label">Nota de revisión</span>
                      <textarea
                        name="review_notes"
                        className="ui-input mt-1 min-h-20 bg-white"
                        placeholder="Opcional"
                      />
                    </label>
                    <button type="submit" className="ui-btn ui-btn--brand mt-3">
                      {request.request_kind === "new_presentation" ? "Aprobar y crear presentación" : "Aprobar solicitud"}
                    </button>
                  </form>

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
