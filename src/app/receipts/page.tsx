import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RECEIPTS_PERMISSION = "procurement.receipts";
const RECEIPT_ACTION_WINDOW_MINUTES = 30;
const RECEIPT_ACTION_WINDOW_MS = RECEIPT_ACTION_WINDOW_MINUTES * 60 * 1000;

type SearchParams = {
  ok?: string;
  history_error?: string;
  site_id?: string;
};

type EntryRow = {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  status: string | null;
  entry_mode: string | null;
  emergency_reason: string | null;
  purchase_order_id: string | null;
  received_at: string | null;
  created_at: string | null;
};

type ReversalRpcError = {
  message?: string;
};

function safeDecode(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function asText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
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

function formatEntryStatus(status: string | null) {
  switch (status) {
    case "received":
      return "Recibida";
    case "reversed":
      return "Reversada";
    case "corrected":
      return "Corregida";
    case "recorded":
      return "Compra registrada";
    case "draft":
      return "Borrador";
    case "cancelled":
      return "Cancelada";
    default:
      return status || "-";
  }
}

function formatEntryMode(entryMode: string | null, status: string | null) {
  if (status === "recorded") return "Solo registro";

  switch (entryMode) {
    case "emergency":
      return "Directa";
    case "normal":
      return "Con OC";
    default:
      return "-";
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

function buildReceiptsUrl(params: { siteId?: string; ok?: string; historyError?: string }) {
  const search = new URLSearchParams();
  if (params.siteId) search.set("site_id", params.siteId);
  if (params.ok) search.set("ok", params.ok);
  if (params.historyError) search.set("history_error", params.historyError);
  const query = search.toString();
  return query ? `/receipts?${query}` : "/receipts";
}

function buildNewReceiptUrl(siteId: string, draftId: string) {
  const search = new URLSearchParams();
  if (siteId) search.set("site_id", siteId);
  if (draftId) search.set("draft_id", draftId);
  const query = search.toString();
  return query ? `/receipts/new?${query}` : "/receipts/new";
}

function buildCorrectionReceiptUrl(siteId: string, entryId: string) {
  const search = new URLSearchParams();
  if (siteId) search.set("site_id", siteId);
  search.set("correction_entry_id", entryId);
  return `/receipts/new?${search.toString()}`;
}

async function reverseReceipt(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect("/login?returnTo=/receipts");
  }

  const entryId = asText(formData.get("entry_id"));
  const siteId = asText(formData.get("site_id"));
  const correctionComment = asText(formData.get("correction_comment"));

  if (!entryId) {
    redirect(buildReceiptsUrl({ siteId, historyError: "Recepción requerida para reversar." }));
  }

  if (!correctionComment) {
    redirect(buildReceiptsUrl({ siteId, historyError: "El comentario de reversión es obligatorio." }));
  }

  const { data: entryToReverse, error: entryToReverseErr } = await supabase
    .from("inventory_entries")
    .select("id,site_id,status,created_at")
    .eq("id", entryId)
    .maybeSingle();

  if (entryToReverseErr) {
    redirect(buildReceiptsUrl({ siteId, historyError: entryToReverseErr.message }));
  }

  if (!entryToReverse || String(entryToReverse.site_id ?? "") !== siteId) {
    redirect(buildReceiptsUrl({ siteId, historyError: "La recepción no pertenece a esta sede." }));
  }

  if (String(entryToReverse.status ?? "") !== "received") {
    redirect(buildReceiptsUrl({ siteId, historyError: "Solo se pueden reversar recepciones en estado Recibida." }));
  }

  const actionWindow = getReceiptActionWindowState(String(entryToReverse.created_at ?? ""));

  if (!actionWindow.isOpen) {
    redirect(
      buildReceiptsUrl({
        siteId,
        historyError: `La ventana para reversar esta recepción ya cerró. Máximo ${RECEIPT_ACTION_WINDOW_MINUTES} minutos desde su creación.`,
      })
    );
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
        historyError: reversalError.message ?? "No se pudo reversar la recepción.",
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
  const okMsg = safeDecode(sp.ok);
  const historyError = safeDecode(sp.history_error);
  const requestedSiteId = String(sp.site_id ?? "").trim();

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

  const siteId = String(requestedSiteId || settings?.selected_site_id || employee?.site_id || "").trim();
  if (!siteId) {
    redirect("/no-access?reason=no_site&returnTo=/receipts");
  }

  const [{ data: siteRow }, entriesQuery] = await Promise.all([
    supabase.from("sites").select("name").eq("id", siteId).maybeSingle(),
    supabase
      .from("inventory_entries")
      .select("id,supplier_name,invoice_number,status,entry_mode,emergency_reason,purchase_order_id,received_at,created_at")
      .eq("site_id", siteId)
      .eq("source_app", "origo")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (entriesQuery.error && entriesQuery.error.code !== "42703") {
    redirect(buildReceiptsUrl({ siteId, historyError: entriesQuery.error.message }));
  }

  let entryRows = (entriesQuery.data ?? []) as EntryRow[];

  if (entriesQuery.error && entriesQuery.error.code === "42703") {
    const fallbackEntriesQuery = await supabase
      .from("inventory_entries")
      .select("id,supplier_name,invoice_number,status,entry_mode,emergency_reason,purchase_order_id,received_at,created_at")
      .eq("site_id", siteId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (fallbackEntriesQuery.error) {
      redirect(buildReceiptsUrl({ siteId, historyError: fallbackEntriesQuery.error.message }));
    }

    entryRows = (fallbackEntriesQuery.data ?? []) as EntryRow[];
  }

  const activeSiteName = String(siteRow?.name ?? "Sede activa").trim();
  const nowMs = Date.now();
  const newReceiptUrl = buildNewReceiptUrl(siteId, randomUUID());

  return (
    <div className="w-full space-y-6">
      <section className="ui-panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="ui-h1">Recepciones</h1>
            <p className="ui-body-muted">
              Consulta recepciones físicas y registros de compra sin inventario desde una misma trazabilidad.
            </p>
            <div className="mt-2 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
              Sede: {activeSiteName}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={newReceiptUrl} className="ui-btn ui-btn--brand">
              Nueva recepción
            </Link>
            <Link href="/purchase-orders" className="ui-btn ui-btn--ghost">
              Órdenes de compra
            </Link>
          </div>
        </div>

        {okMsg === "created" ? (
          <div className="ui-alert ui-alert--success">Recepción registrada correctamente.</div>
        ) : null}
        {okMsg === "recorded" ? (
          <div className="ui-alert ui-alert--success">
            Compra registrada correctamente sin modificar inventario.
          </div>
        ) : null}
        {okMsg === "reversed" ? (
          <div className="ui-alert ui-alert--success">Recepción reversada correctamente.</div>
        ) : null}
        {okMsg === "corrected" ? (
          <div className="ui-alert ui-alert--success">Recepción corregida correctamente.</div>
        ) : null}
        {historyError ? (
          <div className="ui-alert ui-alert--danger">{historyError}</div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-[1.5rem] border border-[var(--ui-border)] bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Total histórico</div>
          <div className="mt-1 text-3xl font-bold text-[var(--ui-text)]">{entryRows.length}</div>
        </div>
        <div className="rounded-[1.5rem] border border-[var(--ui-border)] bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Recibidas</div>
          <div className="mt-1 text-3xl font-bold text-[var(--ui-text)]">
            {entryRows.filter((row) => row.status === "received").length}
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-[var(--ui-border)] bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Solo registros</div>
          <div className="mt-1 text-3xl font-bold text-[var(--ui-text)]">
            {entryRows.filter((row) => row.status === "recorded").length}
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-[var(--ui-border)] bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Reversadas</div>
          <div className="mt-1 text-3xl font-bold text-[var(--ui-text)]">
            {entryRows.filter((row) => row.status === "reversed").length}
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-[var(--ui-border)] bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Corregidas</div>
          <div className="mt-1 text-3xl font-bold text-[var(--ui-text)]">
            {entryRows.filter((row) => row.status === "corrected").length}
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Historial de recepciones</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Las recepciones físicas permiten corrección temporal. Los registros de compra quedan como trazabilidad informativa sin inventario.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="ui-table min-w-full text-sm">
            <thead className="text-left text-[var(--ui-muted)]">
              <tr>
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Proveedor</th>
                <th className="py-2 pr-3">Factura</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Acción</th>
              </tr>
            </thead>
            <tbody>
              {entryRows.map((entryRow) => {
                const actionWindow = getReceiptActionWindowState(entryRow.created_at, nowMs);
                const canModify = entryRow.status === "received" && actionWindow.isOpen;

                return (
                  <tr key={entryRow.id} className="border-t border-zinc-200/60 align-top">
                    <td className="py-3 pr-3 font-mono text-xs">
                      {formatColombiaDateTime(entryRow.received_at ?? entryRow.created_at)}
                    </td>
                    <td className="py-3 pr-3 font-semibold">{entryRow.supplier_name ?? "-"}</td>
                    <td className="py-3 pr-3">{entryRow.invoice_number ?? "-"}</td>
                    <td className="py-3 pr-3">
                      <span
                        className={
                          entryRow.status === "recorded"
                            ? "rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800"
                            : entryRow.entry_mode === "emergency"
                              ? "rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
                              : "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
                        }
                      >
                        {formatEntryMode(entryRow.entry_mode, entryRow.status)}
                      </span>
                      {entryRow.status !== "recorded" && entryRow.entry_mode === "emergency" && entryRow.emergency_reason ? (
                        <div className="mt-1 max-w-[220px] text-xs text-[var(--ui-muted)]">
                          {entryRow.emergency_reason}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3">{formatEntryStatus(entryRow.status)}</td>
                    <td className="py-3 pr-3">
                      {canModify ? (
                        <div className="flex min-w-[300px] flex-col gap-2">
                          <Link
                            href={buildCorrectionReceiptUrl(siteId, entryRow.id)}
                            className="ui-btn ui-btn--brand ui-btn--sm"
                          >
                            Corregir recepción
                          </Link>

                          <form action={reverseReceipt} className="flex flex-col gap-2 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-2">
                            <input type="hidden" name="entry_id" value={entryRow.id} />
                            <input type="hidden" name="site_id" value={siteId} />
                            <input
                              name="correction_comment"
                              className="ui-input h-10 text-xs"
                              placeholder="Comentario para reversar"
                              required
                            />
                            <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                              Solo reversar
                            </button>
                          </form>
                          <div className="text-center text-[11px] font-semibold text-[var(--ui-muted)]">
                            Ventana operativa: {actionWindow.label}
                          </div>
                        </div>
                      ) : entryRow.status === "received" ? (
                        <div className="max-w-[260px] rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs text-[var(--ui-muted)]">
                          <div className="font-semibold text-[var(--ui-text)]">Corrección cerrada</div>
                          <div className="mt-1">
                            La ventana operativa es de {RECEIPT_ACTION_WINDOW_MINUTES} minutos desde la creación.
                          </div>
                        </div>
                      ) : entryRow.status === "recorded" ? (
                        <div className="max-w-[240px] rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                          Registro informativo: no generó movimientos de inventario.
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--ui-muted)]">Sin acciones</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!entryRows.length ? (
                <tr>
                  <td className="py-6 text-[var(--ui-muted)]" colSpan={6}>
                    No hay recepciones registradas para esta sede.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
