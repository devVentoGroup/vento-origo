import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { Button } from "@/components/vento/standard/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/vento/standard/table";
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
          ← Órdenes de compra
        </Link>
        <div className="ui-panel">
          <p className="ui-body-muted">Orden no encontrada o sin acceso.</p>
          <Link href="/purchase-orders" className="mt-4 inline-block">
            <Button variant="secondary">Volver al listado</Button>
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
  const isSent = order.status === "sent";
  const canReceiveInNexo = isSent || order.status === "received";

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/purchase-orders" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
            ← Órdenes de compra
          </Link>
          <h1 className="mt-2 ui-h1">Orden de compra</h1>
          <p className="mt-1 font-mono text-sm text-[var(--ui-muted)]">{order.id}</p>
          <p className="mt-2 text-sm text-[var(--ui-muted)]">
            Estado: <span className="font-medium text-[var(--ui-text)]">{STATUS_LABELS[order.status] ?? order.status}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <>
              <Link href={`/purchase-orders/${id}/edit`}>
                <Button type="button" variant="secondary">
                  Editar
                </Button>
              </Link>
              <form action={setPurchaseOrderSent.bind(null, id)}>
                <Button type="submit" variant="brand">
                  Enviar orden
                </Button>
              </form>
            </>
          )}
          {canReceiveInNexo && (
            <a
              href={`${NEXO_ENTRIES_URL}?purchase_order_id=${encodeURIComponent(id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              <Button type="button" variant="secondary">
                Recibir en Nexo →
              </Button>
            </a>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {errorMsg === "only_draft_editable"
            ? "Solo las órdenes en borrador se pueden editar."
            : decodeURIComponent(errorMsg)}
        </div>
      )}

      <div className="ui-panel max-w-2xl space-y-4">
        <h2 className="ui-h3">Cabecera</h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          <dt className="text-sm text-[var(--ui-muted)]">Proveedor</dt>
          <dd>{(order.suppliers as { name?: string } | null)?.name ?? "—"}</dd>
          <dt className="text-sm text-[var(--ui-muted)]">Sede</dt>
          <dd>{(order.sites as { name?: string } | null)?.name ?? "—"}</dd>
          <dt className="text-sm text-[var(--ui-muted)]">Fecha esperada</dt>
          <dd>{order.expected_at ? new Date(order.expected_at).toLocaleDateString("es") : "—"}</dd>
          <dt className="text-sm text-[var(--ui-muted)]">Total</dt>
          <dd>
            {order.total_amount != null
              ? new Intl.NumberFormat("es-CO", { style: "currency", currency: order.currency || "COP" }).format(Number(order.total_amount))
              : "—"}
          </dd>
          {order.notes && (
            <>
              <dt className="text-sm text-[var(--ui-muted)]">Notas</dt>
              <dd className="sm:col-span-1">{order.notes}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="ui-panel overflow-x-auto">
        <h2 className="ui-h3 mb-4">Líneas</h2>
        {lineItems.length === 0 ? (
          <p className="ui-body-muted">Sin líneas.</p>
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
                    {(item.products as { name?: string; sku?: string } | null)
                      ? `${(item.products as { sku?: string }).sku ? (item.products as { sku: string }).sku + " – " : ""}${(item.products as { name?: string }).name ?? ""}`
                      : item.product_id}
                  </TableCell>
                  <TableCell className="text-right">{Number(item.quantity_ordered)}</TableCell>
                  <TableCell className="text-right">
                    {item.quantity_received != null ? Number(item.quantity_received) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(Number(item.unit_cost))}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.line_total != null
                      ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(Number(item.line_total))
                      : "—"}
                  </TableCell>
                  <TableCell>{item.unit ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
