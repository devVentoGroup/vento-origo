import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { normalizeSitesFromEmployeeSites, type EmployeeSiteRow } from "@/lib/supabase/employee-sites";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/vento/standard/table";
import { Button } from "@/components/vento/standard/ui";
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

export default async function PurchaseOrdersListPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { supabase, user } = await requireAppAccess({ appId: APP_ID, returnTo: RETURN_TO });

  const sp = (await searchParams) ?? {};
  const statusFilter = (sp.status ?? "").trim() || null;
  const siteIdFilter = (sp.site_id ?? "").trim() || null;

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
        <h1 className="ui-h1">Órdenes de compra</h1>
        <div className="ui-panel border-red-200 bg-red-50 dark:bg-red-950/20">
          <p className="text-red-700 dark:text-red-300">Error al cargar: {error.message}</p>
        </div>
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="ui-h1">Órdenes de compra</h1>
          <p className="mt-2 ui-body-muted">
            Listado de órdenes de compra. Crea una nueva o abre el detalle para editar o enviar.
          </p>
        </div>
        <Link href="/purchase-orders/new">
          <Button type="button" variant="brand">
            Nueva orden
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <select
            name="status"
            defaultValue={statusFilter ?? ""}
            className="h-12 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
          >
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="sent">Enviada</option>
            <option value="received">Recibida</option>
          </select>
          <select
            name="site_id"
            defaultValue={siteIdFilter ?? ""}
            className="h-12 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
          >
            <option value="">Todas las sedes</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? s.id}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>
      </div>

      <div className="ui-panel overflow-x-auto">
        {orders.length === 0 ? (
          <div className="ui-empty-state">
            <div className="ui-h3">Sin órdenes de compra</div>
            <p className="mt-2 ui-body-muted">
              Crea la primera desde <strong>Nueva orden</strong>.
            </p>
            <Link href="/purchase-orders/new" className="mt-4 inline-block">
              <Button type="button" variant="brand">
                Nueva orden
              </Button>
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
                    <span className="font-mono text-sm">{po.id.slice(0, 8)}…</span>
                  </TableCell>
                  <TableCell>{(po.suppliers as { name?: string } | null)?.name ?? "—"}</TableCell>
                  <TableCell>{(po.sites as { name?: string } | null)?.name ?? "—"}</TableCell>
                  <TableCell>
                    <span
                      className={
                        po.status === "draft"
                          ? "text-amber-600"
                          : po.status === "received"
                            ? "text-[var(--ui-brand-600)]"
                            : ""
                      }
                    >
                      {STATUS_LABELS[po.status] ?? po.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {po.expected_at
                      ? new Date(po.expected_at).toLocaleDateString("es")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {po.total_amount != null
                      ? new Intl.NumberFormat("es-CO", {
                          style: "currency",
                          currency: po.currency || "COP",
                        }).format(Number(po.total_amount))
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/purchase-orders/${po.id}`}
                      className="text-[var(--ui-brand-600)] hover:underline"
                    >
                      Ver
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
