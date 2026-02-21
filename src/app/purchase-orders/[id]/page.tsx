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
import { normalizeQuantityToBase, normalizeUnitCostToBase } from "@/lib/units/normalize";

import { deletePurchaseOrder, setPurchaseOrderSent } from "../actions";
import type { PurchaseOrderItemWithProduct, PurchaseOrderWithRelations } from "../_lib/types";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RETURN_TO = "/login";

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  received: "Recibida",
};

const STATUS_CHIP_CLASSES: Record<string, string> = {
  draft: "ui-chip ui-chip--warn",
  sent: "ui-chip ui-chip--brand",
  received: "ui-chip ui-chip--success",
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

function formatQty(value: number | null | undefined): string {
  const safe = Number(value ?? 0);
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(Number.isFinite(safe) ? safe : 0);
}

function normalizeRole(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export default async function PurchaseOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { supabase, user } = await requireAppAccess({ appId: APP_ID, returnTo: RETURN_TO });
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
  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const activeRole = normalizeRole(String(employee?.role ?? ""));
  const canDeleteByRole = ["propietario", "gerente", "gerente_general", "gerente general"].includes(activeRole);
  const canDeleteOrder = isDraft && canDeleteByRole;

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
      <section className="ui-panel space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,540px)]">
          <div className="space-y-4">
            <Link href="/purchase-orders" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
              {"<-"} Ordenes de compra
            </Link>
            <h1 className="ui-h1">Detalle de orden de compra</h1>
            <p className="font-mono text-sm text-[var(--ui-muted)]">{orderRef}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className={STATUS_CHIP_CLASSES[order.status] ?? "ui-chip"}>
                Estado: {STATUS_LABELS[order.status] ?? order.status}
              </span>
              <span className="ui-chip">{lineItems.length} linea(s)</span>
              <span className="ui-chip">{formatMoney(order.total_amount, order.currency)}</span>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {isDraft ? (
              <>
                <Link href={`/purchase-orders/${id}/edit`} className="ui-btn ui-btn--ghost w-full whitespace-nowrap">
                  Editar
                </Link>
                <form action={setPurchaseOrderSent.bind(null, id)} className="w-full">
                  <button type="submit" className="ui-btn ui-btn--brand w-full whitespace-nowrap">
                    Enviar orden
                  </button>
                </form>
                {canDeleteOrder ? (
                  <form action={deletePurchaseOrder.bind(null, id)} className="w-full">
                    <button type="submit" className="ui-btn ui-btn--ghost w-full whitespace-nowrap">
                      Eliminar OC
                    </button>
                  </form>
                ) : null}
              </>
            ) : null}

            <a
              href={pdfPathWithToken}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-btn ui-btn--ghost w-full whitespace-nowrap"
            >
              Descargar PDF OC
            </a>

            <CopyPoMessageButton message={messageToSupplier} className="w-full whitespace-nowrap" />

            {canReceiveInOrigo ? (
              <a
                href={receiveInOrigoHref.toString()}
                target="_blank"
                rel="noopener noreferrer"
                className="ui-btn ui-btn--ghost w-full whitespace-nowrap"
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
              : errorMsg === "only_draft_deletable"
                ? "Solo las ordenes en borrador se pueden eliminar."
                : errorMsg === "delete_forbidden_role"
                  ? "Solo propietarios y gerentes pueden eliminar ordenes."
              : decodeURIComponent(errorMsg)}
          </div>
        ) : null}
      </section>

      <section className="ui-panel space-y-4">
        <div className="ui-h3">Cabecera</div>
        <div className="grid gap-3 lg:grid-cols-2">
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="ui-h3">Lineas</div>
          <span className="ui-chip">{lineItems.length} linea(s) registradas</span>
        </div>
        <div className="mb-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-sm text-[var(--ui-muted)]">
          Cantidad = unidad operativa de compra. Cantidad base y costo base son equivalencias normalizadas
          para comparar insumos entre si (por ejemplo, kg a g).
        </div>
        {lineItems.length === 0 ? (
          <div className="ui-panel-soft p-4">
            <p className="ui-body-muted">Sin lineas registradas.</p>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell className="text-right">Cantidad (op.)</TableHeaderCell>
                <TableHeaderCell className="text-right">Cantidad (base)</TableHeaderCell>
                <TableHeaderCell className="text-right">Recibido</TableHeaderCell>
                <TableHeaderCell className="text-right">Costo unit. (op.)</TableHeaderCell>
                <TableHeaderCell className="text-right">Costo unit. (base)</TableHeaderCell>
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
                const opQty = Number(item.quantity_ordered ?? 0);
                const opCost = Number(item.unit_cost ?? 0);
                const unitCode = String(item.unit ?? "u");
                const normalizedQty = normalizeQuantityToBase({ quantity: opQty, unit: unitCode });
                const normalizedCost = normalizeUnitCostToBase({ unitCost: opCost, unit: unitCode });

                return (
                  <TableRow key={item.id}>
                    <TableCell>{productLabel}</TableCell>
                    <TableCell className="text-right">
                      {formatQty(opQty)} {unitCode}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatQty(normalizedQty.baseQuantity)} {normalizedQty.baseUnit}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.quantity_received != null ? formatQty(Number(item.quantity_received)) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(opCost, order.currency)} / {unitCode}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(normalizedCost.baseUnitCost, order.currency)} / {normalizedQty.baseUnit}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(item.line_total, order.currency)}</TableCell>
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
