import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { normalizeSitesFromEmployeeSites, type EmployeeSiteRow } from "@/lib/supabase/employee-sites";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import type { PurchaseOrderWithRelations } from "./_lib/types";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RETURN_TO = "/login";

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  received: "Recibida",
};

type SearchParams = { status?: string; site_id?: string };

function formatMoney(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: currency || "COP",
  }).format(Number(value));
}

export default async function PurchaseOrdersListPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { supabase, user } = await requireAppAccess({ appId: APP_ID, returnTo: RETURN_TO });

  const sp = (await searchParams) ?? {};
  const statusFilter = (sp.status ?? "").trim() || "";
  const siteIdFilter = (sp.site_id ?? "").trim() || "";

  let query = supabase
    .from("purchase_orders")
    .select(
      "id,supplier_id,site_id,status,created_at,expected_at,received_at,total_amount,currency,notes,created_by,suppliers(id,name),sites(id,name)"
    )
    .order("created_at", { ascending: false });

  if (statusFilter) query = query.eq("status", statusFilter);
  if (siteIdFilter) query = query.eq("site_id", siteIdFilter);

  const { data: rows, error } = await query;
  if (error) {
    return (
      <div className="w-full space-y-6">
        <h1 className="ui-h1">Ordenes de compra</h1>
        <div className="ui-alert ui-alert--error">Error al cargar ordenes: {error.message}</div>
      </div>
    );
  }

  const orders = (rows ?? []) as unknown as PurchaseOrderWithRelations[];

  const { data: userSites } = await supabase
    .from("employee_sites")
    .select("site_id,sites(id,name)")
    .eq("employee_id", user.id)
    .eq("is_active", true);
  const sites = normalizeSitesFromEmployeeSites(userSites as EmployeeSiteRow[]);

  return (
    <div className="w-full space-y-6">
      <section className="ui-panel space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="ui-h1">Ordenes de compra</h1>
            <p className="mt-2 ui-body-muted">
              Gestiona borradores, ordenes enviadas y recepciones vinculadas con Nexo.
            </p>
          </div>
          <Link href="/purchase-orders/new" className="ui-btn ui-btn--brand">
            Nueva orden
          </Link>
        </div>

        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="ui-label">Estado</span>
            <select name="status" defaultValue={statusFilter} className="ui-input mt-1">
              <option value="">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="sent">Enviada</option>
              <option value="received">Recibida</option>
            </select>
          </label>
          <label>
            <span className="ui-label">Sede</span>
            <select name="site_id" defaultValue={siteIdFilter} className="ui-input mt-1">
              <option value="">Todas las sedes</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.id}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button type="submit" className="ui-btn ui-btn--brand">Aplicar</button>
            <Link href="/purchase-orders" className="ui-btn ui-btn--ghost">Limpiar</Link>
          </div>
        </form>
      </section>

      <section className="ui-panel overflow-x-auto">
        {orders.length === 0 ? (
          <div className="ui-empty-state">
            <div className="ui-h3">Sin ordenes de compra</div>
            <p className="mt-2 ui-body-muted">Crea la primera desde el boton Nueva orden.</p>
            <Link href="/purchase-orders/new" className="mt-4 ui-btn ui-btn--brand">
              Nueva orden
            </Link>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Referencia</TableHeaderCell>
                <TableHeaderCell>Proveedor</TableHeaderCell>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Fecha esperada</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
                <TableHeaderCell className="text-right">Acciones</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((po) => (
                <TableRow key={po.id}>
                  <TableCell>
                    <span className="font-mono text-sm">{po.id.slice(0, 8)}...</span>
                  </TableCell>
                  <TableCell>{(po.suppliers as { name?: string } | null)?.name ?? "—"}</TableCell>
                  <TableCell>{(po.sites as { name?: string } | null)?.name ?? "—"}</TableCell>
                  <TableCell>
                    <span
                      className={
                        po.status === "draft"
                          ? "ui-chip"
                          : po.status === "received"
                            ? "ui-chip ui-chip--success"
                            : "ui-chip ui-chip--brand"
                      }
                    >
                      {STATUS_LABELS[po.status] ?? po.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {po.expected_at ? new Date(po.expected_at).toLocaleDateString("es") : "—"}
                  </TableCell>
                  <TableCell>{formatMoney(po.total_amount, po.currency)}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/purchase-orders/${po.id}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                      Ver detalle
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
