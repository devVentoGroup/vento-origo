import Link from "next/link";

import { PurchaseOrderGuidedForm } from "@/components/vento/purchase-orders/purchase-order-guided-form";
import { requireAppAccess } from "@/lib/auth/guard";
import { normalizeSitesFromEmployeeSites, type EmployeeSiteRow } from "@/lib/supabase/employee-sites";
import { updatePurchaseOrder } from "../../actions";
import type { PurchaseOrderWithRelations } from "../../_lib/types";
import type { PurchaseOrderItemWithProduct } from "../../_lib/types";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RETURN_TO = "/login";

export default async function EditPurchaseOrderPage({
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
    .select("id,supplier_id,site_id,status,expected_at,notes,suppliers(id,name),sites(id,name)")
    .eq("id", id)
    .single();

  if (error || !po) {
    return (
      <div className="w-full space-y-6">
        <Link href="/purchase-orders" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
          ← Ordenes de compra
        </Link>
        <div className="ui-panel">
          <p className="ui-body-muted">Orden no encontrada.</p>
          <Link href="/purchase-orders" className="mt-4 inline-block ui-btn ui-btn--ghost">
            Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  const order = po as unknown as PurchaseOrderWithRelations;
  if (order.status !== "draft") {
    return (
      <div className="w-full space-y-6">
        <Link href="/purchase-orders" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
          ← Ordenes de compra
        </Link>
        <div className="ui-panel">
          <p className="ui-body-muted">Solo se pueden editar ordenes en borrador.</p>
          <Link href={`/purchase-orders/${id}`} className="mt-4 inline-block ui-btn ui-btn--ghost">
            Ver detalle
          </Link>
        </div>
      </div>
    );
  }

  const { data: items } = await supabase
    .from("purchase_order_items")
    .select("id,product_id,quantity_ordered,unit_cost,unit,products(id,name,sku)")
    .eq("purchase_order_id", id)
    .order("created_at", { ascending: true });

  const lineItems = (items ?? []) as unknown as PurchaseOrderItemWithProduct[];

  const [suppliersRes, sitesRes, productsRes] = await Promise.all([
    supabase.from("suppliers").select("id,name").eq("is_active", true).order("name"),
    supabase
      .from("employee_sites")
      .select("site_id,sites(id,name)")
      .eq("employee_id", user.id)
      .eq("is_active", true),
    supabase.from("products").select("id,name,sku").order("name").limit(500),
  ]);

  const suppliers = (suppliersRes.data ?? []) as { id: string; name: string }[];
  const sites = normalizeSitesFromEmployeeSites(sitesRes.data as EmployeeSiteRow[]);
  const products = (productsRes.data ?? []) as { id: string; name: string; sku: string | null }[];

  const expectedAt = order.expected_at ? new Date(order.expected_at).toISOString().slice(0, 10) : "";

  return (
    <div className="w-full space-y-6">
      <div>
        <Link href={`/purchase-orders/${id}`} className="ui-caption text-[var(--ui-brand-600)] hover:underline">
          ← Ver orden
        </Link>
        <h1 className="mt-2 ui-h1">Editar orden de compra</h1>
        <p className="mt-2 ui-body-muted">
          Modifica cabecera y lineas en formato guiado. El guardado reemplaza las lineas actuales.
        </p>
      </div>

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">
          {errorMsg === "supplier_site_required"
            ? "Proveedor y sede son obligatorios."
            : decodeURIComponent(errorMsg)}
        </div>
      ) : null}

      <PurchaseOrderGuidedForm
        mode="edit"
        action={updatePurchaseOrder.bind(null, id)}
        cancelHref={`/purchase-orders/${id}`}
        suppliers={suppliers}
        sites={sites}
        products={products}
        defaultValues={{
          supplier_id: order.supplier_id,
          site_id: order.site_id,
          expected_at: expectedAt,
          notes: order.notes ?? "",
          lines: lineItems.map((item) => ({
            product_id: item.product_id,
            quantity: Number(item.quantity_ordered ?? 0),
            unit_cost: Number(item.unit_cost ?? 0),
            unit: item.unit ?? "",
          })),
        }}
      />
    </div>
  );
}
