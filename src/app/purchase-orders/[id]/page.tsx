import Link from "next/link";

import { CopyPoMessageButton } from "@/components/vento/purchase-orders/copy-po-message-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { buildPurchaseOrderMessage } from "@/lib/purchase-orders/message-template";
import { createPurchaseOrderPdfToken } from "@/lib/purchase-orders/public-pdf-token";
import { formatPurchaseOrderRef } from "@/lib/purchase-orders/reference";

import { setPurchaseOrderSent } from "../actions";
import type { PurchaseOrderItemWithProduct, PurchaseOrderWithRelations } from "../_lib/types";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RETURN_TO = "/login";

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  received: "Recibida",
};

const ORIGO_RECEIPTS_URL =
  process.env.NEXT_PUBLIC_ORIGO_RECEIPTS_URL ||
  `${process.env.NEXT_PUBLIC_ORIGO_URL?.replace(/\/$/, "") || "https://origo.ventogroup.co"}/receipts/new`;

const ORIGO_BASE_URL =
  process.env.NEXT_PUBLIC_ORIGO_URL?.replace(/\/$/, "") || "https://origo.ventogroup.co";

function formatMoney(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null) return "-";
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
          {"<-"} Ordenes de compra
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
  const canReceiveInOrigo = order.status === "sent" || order.status === "received";

  const supplierName = (order.suppliers as { name?: string } | null)?.name ?? "Proveedor";
  const siteName = (order.sites as { name?: string } | null)?.name ?? "Sede";
  const orderRef = formatPurchaseOrderRef({ id: order.id, createdAt: order.created_at });

  const receiveInOrigoHref = new URL(ORIGO_RECEIPTS_URL);
  receiveInOrigoHref.searchParams.set("purchase_order_id", String(order.id));

  const pdfPath = `/purchase-orders/${encodeURIComponent(order.id)}/pdf`;
  const pdfToken = createPurchaseOrderPdfToken(order.id);
  const pdfPathWithToken = `${pdfPath}?t=${encodeURIComponent(pdfToken)}`;
  const pdfUrl = `${ORIGO_BASE_URL}${pdfPathWithToken}`;
  const messageToSupplier = buildPurchaseOrderMessage({
    orderRef,
    supplierName,
    siteName,
    expectedAt: order.expected_at,
    totalAmount: order.total_amount,
    currency: order.currency,
    pdfUrl,
  });

  return (
    <div className="w-full space-y-6">
      <section className="ui-panel space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/purchase-orders" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
              {"<-"} Ordenes de compra
            </Link>
            <h1 className="mt-2 ui-h1">Detalle de orden de compra</h1>
            <p className="mt-1 font-mono text-sm text-[var(--ui-muted)]">{orderRef}</p>
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

            <a href={pdfPathWithToken} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn--ghost">
              Descargar PDF OC
            </a>

            <CopyPoMessageButton message={messageToSupplier} />

            {canReceiveInOrigo ? (
              <a
                href={receiveInOrigoHref.toString()}
                target="_blank"
                rel="noopener noreferrer"
                className="ui-btn ui-btn--ghost"
              >
                Recibir en Origo
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
            <div className="font-semibold">{supplierName}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Sede</div>
            <div className="font-semibold">{siteName}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Fecha esperada</div>
            <div className="font-semibold">
              {order.expected_at ? new Date(order.expected_at).toLocaleDateString("es-CO") : "-"}
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
              {lineItems.map((item) => {
                const product = item.products as { sku?: string | null; name?: string | null } | null;
                const productLabel = product
                  ? `${product.sku ? `${product.sku} - ` : ""}${product.name ?? ""}`
                  : item.product_id;

                return (
                  <TableRow key={item.id}>
                    <TableCell>{productLabel}</TableCell>
                    <TableCell className="text-right">{Number(item.quantity_ordered)}</TableCell>
                    <TableCell className="text-right">
                      {item.quantity_received != null ? Number(item.quantity_received) : "-"}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(Number(item.unit_cost), "COP")}</TableCell>
                    <TableCell className="text-right">{formatMoney(item.line_total, "COP")}</TableCell>
                    <TableCell>{item.unit ?? "-"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
