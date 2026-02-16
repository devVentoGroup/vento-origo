import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { setPurchaseOrderSent } from "../actions";
import type { PurchaseOrderWithRelations } from "../_lib/types";
import type { PurchaseOrderItemWithProduct } from "../_lib/types";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RETURN_TO = "/login";

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  received: "Recibida",
};

const NEXO_ENTRIES_URL =
  process.env.NEXT_PUBLIC_NEXO_ENTRIES_URL ||
  process.env.NEXT_PUBLIC_NEXO_URL?.replace(/\/$/, "") + "/inventory/entries" ||
  "https://nexo.ventogroup.co/inventory/entries";

function formatMoney(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: currency || "COP",
  }).format(Number(value));
}

export default async function PurchaseOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { supabase } = await requireAppAccess({ appId: APP_ID, returnTo: RETURN_TO });
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error;

  const { data: po, error } = await supabase
    .from("purchase_orders")
    .select(
      "id,supplier_id,site_id,status,created_at,expected_at,received_at,total_amount,currency,notes,suppliers(id,name),sites(id,name)"
    )
    .eq("id", id)
    .single();

  if (error || !po) {
    return (
      <div className="w-full space-y-6">
        <Link href="/purchase-orders" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
          ← Ordenes de compra
        </Link>
        <div className="ui-panel">
          <p className="ui-body-muted">Orden no encontrada o sin acceso.</p>
          <Link href="/purchase-orders" className="mt-4 inline-block ui-btn ui-btn--ghost">
            Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  const { data: items } = await supabase
    .from("purchase_order_items")
    .select("id,product_id,quantity_ordered,quantity_received,unit_cost,line_total,unit,products(id,name,sku)")
    .eq("purchase_order_id", id)
    .order("created_at", { ascending: true });

  const order = po as unknown as PurchaseOrderWithRelations;
  const lineItems = (items ?? []) as unknown as PurchaseOrderItemWithProduct[];
  const isDraft = order.status === "draft";
  const canReceiveInNexo = order.status === "sent" || order.status === "received";

  return (
    <div className="w-full space-y-6">
      <section className="ui-panel space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/purchase-orders" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
              ← Ordenes de compra
            </Link>
            <h1 className="mt-2 ui-h1">Detalle de orden de compra</h1>
            <p className="mt-1 font-mono text-sm text-[var(--ui-muted)]">{order.id}</p>
            <p className="mt-2 ui-body-muted">
              Estado: <strong>{STATUS_LABELS[order.status] ?? order.status}</strong>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isDraft ? (
              <>
                <Link href={`/purchase-orders/${id}/edit`} className="ui-btn ui-btn--ghost">
                  Editar
                </Link>
                <form action={setPurchaseOrderSent.bind(null, id)}>
                  <button type="submit" className="ui-btn ui-btn--brand">
                    Enviar orden
                  </button>
                </form>
              </>
            ) : null}
            {canReceiveInNexo ? (
              <a
                href={`${NEXO_ENTRIES_URL}?purchase_order_id=${encodeURIComponent(id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ui-btn ui-btn--ghost"
              >
                Recibir en Nexo
              </a>
            ) : null}
          </div>
        </div>

        {errorMsg ? (
          <div className="ui-alert ui-alert--error">
            {errorMsg === "only_draft_editable"
              ? "Solo las ordenes en borrador se pueden editar."
              : decodeURIComponent(errorMsg)}
          </div>
        ) : null}
      </section>

      <section className="ui-panel max-w-3xl space-y-4">
        <div className="ui-h3">Cabecera</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Proveedor</div>
            <div className="font-semibold">{(order.suppliers as { name?: string } | null)?.name ?? "—"}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Sede</div>
            <div className="font-semibold">{(order.sites as { name?: string } | null)?.name ?? "—"}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Fecha esperada</div>
            <div className="font-semibold">
              {order.expected_at ? new Date(order.expected_at).toLocaleDateString("es") : "—"}
            </div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Total</div>
            <div className="font-semibold">{formatMoney(order.total_amount, order.currency)}</div>
          </div>
          <div className="ui-panel-soft p-3 sm:col-span-2">
            <div className="ui-caption">Notas</div>
            <div className="font-semibold">{order.notes || "Sin notas"}</div>
          </div>
        </div>
      </section>

      <section className="ui-panel overflow-x-auto">
        <div className="ui-h3 mb-4">Lineas</div>
        {lineItems.length === 0 ? (
          <p className="ui-body-muted">Sin lineas registradas.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell className="text-right">Cantidad</TableHeaderCell>
                <TableHeaderCell className="text-right">Recibido</TableHeaderCell>
                <TableHeaderCell className="text-right">Costo unit.</TableHeaderCell>
                <TableHeaderCell className="text-right">Total</TableHeaderCell>
                <TableHeaderCell>Unidad</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lineItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {(item.products as { sku?: string; name?: string } | null)
                      ? `${(item.products as { sku?: string }).sku ? `${(item.products as { sku: string }).sku} - ` : ""}${(item.products as { name?: string }).name ?? ""}`
                      : item.product_id}
                  </TableCell>
                  <TableCell className="text-right">{Number(item.quantity_ordered)}</TableCell>
                  <TableCell className="text-right">
                    {item.quantity_received != null ? Number(item.quantity_received) : "—"}
                  </TableCell>
                  <TableCell className="text-right">{formatMoney(Number(item.unit_cost), "COP")}</TableCell>
                  <TableCell className="text-right">{formatMoney(item.line_total, "COP")}</TableCell>
                  <TableCell>{item.unit ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
