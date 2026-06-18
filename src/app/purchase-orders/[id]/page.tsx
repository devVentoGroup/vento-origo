import Link from "next/link";
import { headers } from "next/headers";

import { CopyPoMessageButton } from "@/components/vento/purchase-orders/copy-po-message-button";
import { requireAppAccess } from "@/lib/auth/guard";
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

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString("es-CO") : "Sin fecha definida";
}

function formatDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString("es-CO") : "-";
}

function normalizeRole(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getProductLabel(item: PurchaseOrderItemWithProduct): string {
  const product = item.products as { sku?: string | null; name?: string | null } | null;
  if (!product) return String(item.product_id ?? "Producto");
  return `${product.sku ? `${product.sku} - ` : ""}${product.name ?? "Producto"}`;
}

function getSupplierLineLabel(
  item: PurchaseOrderItemWithProduct & {
    input_unit_label?: string | null;
  },
  supplierAliasesByProduct: Map<string, string>
): string {
  const alias = supplierAliasesByProduct.get(String(item.product_id ?? "").trim());
  if (alias) return alias;
  return String(item.input_unit_label ?? item.unit ?? "").trim() || "Producto";
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

  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "";
  const proto = headersList.get("x-forwarded-proto") ?? "https";
  const appOrigin =
    process.env.NEXT_PUBLIC_ORIGO_URL?.replace(/\/$/, "") ||
    (host ? `${proto}://${host}` : "https://origo.ventogroup.co");

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
    .select("id,product_id,quantity_ordered,quantity_received,unit_cost,line_total,unit,input_unit_label,stock_quantity_ordered,stock_unit_code,products(id,name,sku)")
    .eq("purchase_order_id", id)
    .order("created_at", { ascending: true });

  const order = po as unknown as PurchaseOrderWithRelations;
  const lineItems = (items ?? []) as unknown as PurchaseOrderItemWithProduct[];
  const productIds = Array.from(
    new Set(lineItems.map((item) => String(item.product_id ?? "").trim()).filter(Boolean))
  );
  const { data: supplierAliasRows } = productIds.length
    ? await supabase
        .from("product_suppliers")
        .select("product_id,supplier_product_alias")
        .eq("supplier_id", order.supplier_id)
        .in("product_id", productIds)
    : { data: [] as Array<{ product_id: string; supplier_product_alias: string | null }> };
  const supplierAliasesByProduct = new Map<string, string>();
  for (const row of (supplierAliasRows ?? []) as Array<{ product_id: string; supplier_product_alias: string | null }>) {
    const productId = String(row.product_id ?? "").trim();
    const alias = String(row.supplier_product_alias ?? "").trim();
    if (productId && alias) supplierAliasesByProduct.set(productId, alias);
  }
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
  const expectedAtLabel = formatDate(order.expected_at);
  const createdAtLabel = formatDateTime(order.created_at);
  const statusLabel = STATUS_LABELS[order.status] ?? order.status;

  const receiveInOrigoHref = new URL(ORIGO_RECEIPTS_URL);
  receiveInOrigoHref.searchParams.set("purchase_order_id", String(order.id));

  const pdfPath = `/purchase-orders/${encodeURIComponent(order.id)}/pdf`;
  const pdfToken = createPurchaseOrderPdfToken(order.id);
  const pdfPathWithToken = `${pdfPath}?t=${encodeURIComponent(pdfToken)}`;
  const pdfUrlWithToken = new URL(pdfPathWithToken, appOrigin).toString();

  const supplierLines = lineItems.map((item, index) => {
    const opQty = Number(item.quantity_ordered ?? 0);
    const supplierLabel = getSupplierLineLabel(item, supplierAliasesByProduct);
    return `${index + 1}. ${formatQty(opQty)} ${supplierLabel}`;
  });

  const messageToSupplier = [
    `Hola ${supplierName},`,
    "",
    `Por favor nos ayudas confirmando disponibilidad para la orden de compra ${orderRef}.`,
    `Sede destino: ${siteName}.`,
    `Fecha esperada: ${expectedAtLabel}.`,
    "",
    "Productos solicitados:",
    ...(supplierLines.length ? supplierLines : ["- Sin lineas registradas."]),
    ...(order.notes ? ["", `Notas: ${order.notes}`] : []),
    "",
    `PDF de la solicitud: ${pdfUrlWithToken}`,
    "",
    "Quedamos atentos a tu confirmacion. Gracias.",
  ].join("\n");

  const requestedQtyTotal = lineItems.reduce((acc, item) => acc + Number(item.quantity_ordered ?? 0), 0);
  const receivedQtyTotal = lineItems.reduce((acc, item) => acc + Number(item.quantity_received ?? 0), 0);

  return (
    <div className="w-full space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-[var(--ui-border)] bg-white shadow-sm">
        <div className="border-b border-[var(--ui-border)] bg-gradient-to-br from-[var(--ui-surface-2)] via-white to-[var(--ui-surface-2)] p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-4">
              <Link href="/purchase-orders" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
                {"<-"} Ordenes de compra
              </Link>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={STATUS_CHIP_CLASSES[order.status] ?? "ui-chip"}>{statusLabel}</span>
                  <span className="ui-chip">{lineItems.length} linea(s)</span>
                  <span className="ui-chip">OC</span>
                </div>
                <h1 className="ui-h1">{orderRef}</h1>
                <p className="max-w-3xl text-sm leading-6 text-[var(--ui-muted)]">
                  Solicitud de compra para <strong className="text-[var(--ui-text)]">{supplierName}</strong>,
                  destino <strong className="text-[var(--ui-text)]">{siteName}</strong>. Desde aquí puedes copiar
                  el mensaje con el PDF público para el proveedor y gestionar la orden internamente.
                </p>
              </div>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-3 xl:min-w-[520px]">
              <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                <div className="ui-caption">Fecha esperada</div>
                <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">{expectedAtLabel}</div>
              </div>
              <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                <div className="ui-caption">Total interno</div>
                <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                  {formatMoney(order.total_amount, order.currency)}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                <div className="ui-caption">Creada</div>
                <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">{createdAtLabel}</div>
              </div>
            </div>
          </div>
        </div>

        {errorMsg ? (
          <div className="m-5 ui-alert ui-alert--error sm:m-6">
            {errorMsg === "only_draft_editable"
              ? "Solo las ordenes en borrador se pueden editar."
              : errorMsg === "only_draft_deletable"
                ? "Solo las ordenes en borrador se pueden eliminar."
                : errorMsg === "delete_forbidden_role"
                  ? "Solo propietarios y gerentes pueden eliminar ordenes."
                  : decodeURIComponent(errorMsg)}
          </div>
        ) : null}

        <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[1.5rem] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
              <div className="ui-caption">Proveedor</div>
              <div className="mt-1 text-lg font-bold text-[var(--ui-text)]">{supplierName}</div>
            </div>
            <div className="rounded-[1.5rem] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
              <div className="ui-caption">Sede destino</div>
              <div className="mt-1 text-lg font-bold text-[var(--ui-text)]">{siteName}</div>
            </div>
            <div className="rounded-[1.5rem] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
              <div className="ui-caption">Cantidad solicitada</div>
              <div className="mt-1 text-lg font-bold text-[var(--ui-text)]">{formatQty(requestedQtyTotal)}</div>
            </div>
            <div className="rounded-[1.5rem] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
              <div className="ui-caption">Cantidad recibida</div>
              <div className="mt-1 text-lg font-bold text-[var(--ui-text)]">{formatQty(receivedQtyTotal)}</div>
            </div>
            <div className="rounded-[1.5rem] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 md:col-span-2">
              <div className="ui-caption">Notas internas</div>
              <div className="mt-1 text-sm font-semibold leading-6 text-[var(--ui-text)]">
                {order.notes || "Sin notas"}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[1.5rem] border border-[var(--ui-border)] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-[var(--ui-text)]">Enviar al proveedor</div>
                  <p className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
                    Copia la solicitud con productos, cantidades, sede, fecha y link público del PDF para proveedor.
                  </p>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                  Sin costos
                </span>
              </div>

              <div className="mt-4 grid gap-2">
                <CopyPoMessageButton message={messageToSupplier} className="w-full whitespace-nowrap" />
                <a
                  href={pdfPathWithToken}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-btn ui-btn--ghost w-full whitespace-nowrap"
                >
                  Abrir PDF proveedor
                </a>
              </div>

            </div>

            <div className="rounded-[1.5rem] border border-[var(--ui-border)] bg-white p-4 shadow-sm">
              <div className="text-sm font-bold text-[var(--ui-text)]">Gestion interna</div>
              <p className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
                Acciones operativas para editar, marcar envio o recibir mercancia.
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {isDraft ? (
                  <>
                    <Link href={`/purchase-orders/${id}/edit`} className="ui-btn ui-btn--ghost w-full whitespace-nowrap">
                      Editar orden
                    </Link>
                    <form action={setPurchaseOrderSent.bind(null, id)} className="w-full">
                      <button type="submit" className="ui-btn ui-btn--brand w-full whitespace-nowrap">
                        Marcar como enviada
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

                {canReceiveInOrigo ? (
                  <a
                    href={receiveInOrigoHref.toString()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ui-btn ui-btn--brand w-full whitespace-nowrap"
                  >
                    Recibir en Origo
                  </a>
                ) : null}

                {!isDraft && !canReceiveInOrigo ? (
                  <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-xs text-[var(--ui-muted)]">
                    No hay acciones disponibles para este estado.
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="ui-panel">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Productos solicitados</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Vista operativa interna. Las cantidades y costos se muestran separados para evitar lecturas cruzadas.
            </p>
          </div>
          <span className="ui-chip">{lineItems.length} línea(s)</span>
        </div>

        {lineItems.length === 0 ? (
          <div className="ui-panel-soft p-4">
            <p className="ui-body-muted">Sin líneas registradas.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lineItems.map((item, index) => {
              const productLabel = getProductLabel(item);
              const opQty = Number(item.quantity_ordered ?? 0);
              const opCost = Number(item.unit_cost ?? 0);
              const unitCode = String(item.unit ?? "u");
              const supplierLabel = getSupplierLineLabel(item, supplierAliasesByProduct);
              const snapshotStockQty = Number(item.stock_quantity_ordered ?? NaN);
              const snapshotStockUnit = String(item.stock_unit_code ?? "").trim();
              const normalizedQty = Number.isFinite(snapshotStockQty) && snapshotStockQty > 0 && snapshotStockUnit
                ? {
                    baseQuantity: snapshotStockQty,
                    baseUnit: snapshotStockUnit,
                  }
                : normalizeQuantityToBase({ quantity: opQty, unit: unitCode });
              const normalizedCost = normalizeUnitCostToBase({ unitCost: opCost, unit: unitCode });
              const receivedLabel =
                item.quantity_received != null ? `${formatQty(Number(item.quantity_received))} ${unitCode}` : "Pendiente";

              return (
                <article
                  key={item.id}
                  className="rounded-[1.5rem] border border-[var(--ui-border)] bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="ui-caption">Producto #{index + 1}</div>
                      <div className="mt-1 text-base font-bold leading-6 text-[var(--ui-text)]">
                        {productLabel}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 lg:min-w-[180px] lg:text-right">
                      <div className="ui-caption">Total interno</div>
                      <div className="mt-1 text-base font-bold text-[var(--ui-text)]">
                        {formatMoney(item.line_total, order.currency)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                      <div className="ui-caption">Pedido proveedor</div>
                      <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                        {formatQty(opQty)} {supplierLabel}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                      <div className="ui-caption">Cantidad base</div>
                      <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                        {formatQty(normalizedQty.baseQuantity)} {normalizedQty.baseUnit}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                      <div className="ui-caption">Recibido</div>
                      <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">{receivedLabel}</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                      <div className="ui-caption">Unidad operativa</div>
                      <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">{item.unit ?? "-"}</div>
                    </div>
                  </div>

                  <details className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3">
                    <summary className="cursor-pointer text-sm font-bold text-[var(--ui-text)]">
                      Ver costos internos
                    </summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                        <div className="ui-caption">Costo operativo</div>
                        <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                          {formatMoney(opCost, order.currency)} / {unitCode}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                        <div className="ui-caption">Costo base</div>
                        <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                          {formatMoney(normalizedCost.baseUnitCost, order.currency)} / {normalizedQty.baseUnit}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                        <div className="ui-caption">Total interno</div>
                        <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                          {formatMoney(item.line_total, order.currency)}
                        </div>
                      </div>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
