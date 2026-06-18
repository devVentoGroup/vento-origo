import Link from "next/link";

import { PurchaseOrderGuidedForm } from "@/components/vento/purchase-orders/purchase-order-guided-form";
import { requireAppAccess } from "@/lib/auth/guard";
import { normalizeSitesFromEmployeeSites, type EmployeeSiteRow } from "@/lib/supabase/employee-sites";
import { updatePurchaseOrder } from "../../actions";
import type { PurchaseOrderWithRelations } from "../../_lib/types";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RETURN_TO = "/login";

type ProductPresentationOption = {
  id: string;
  product_id: string;
  label: string;
  input_unit_code: string;
  qty_in_stock_unit: number;
  is_default: boolean;
};

type PurchaseOrderEditItemRow = {
  id: string;
  product_id: string;
  quantity_ordered: number | null;
  unit_cost: number | null;
  unit: string | null;
  input_uom_profile_id: string | null;
  products?: { id: string; name: string | null; sku: string | null } | { id: string; name: string | null; sku: string | null }[] | null;
};

function normalizePresentationLabel(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

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
    .select("id,product_id,quantity_ordered,unit_cost,unit,input_uom_profile_id,products(id,name,sku)")
    .eq("purchase_order_id", id)
    .order("created_at", { ascending: true });

  const lineItems = (items ?? []) as unknown as PurchaseOrderEditItemRow[];

  const [suppliersRes, sitesRes, productsRes] = await Promise.all([
    supabase.from("suppliers").select("id,name").eq("is_active", true).order("name"),
    supabase
      .from("employee_sites")
      .select("site_id,sites(id,name)")
      .eq("employee_id", user.id)
      .eq("is_active", true),
    supabase.from("products").select("id,name,sku,unit,stock_unit_code,cost").order("name").limit(1200),
  ]);

  const suppliers = (suppliersRes.data ?? []) as { id: string; name: string }[];
  const sites = normalizeSitesFromEmployeeSites(sitesRes.data as EmployeeSiteRow[]);
  const products = (productsRes.data ?? []) as {
    id: string;
    name: string;
    sku: string | null;
    unit: string | null;
    stock_unit_code: string | null;
    cost: number | null;
  }[];
  const productIds = products.map((product) => product.id);
  const [{ data: supplierLinksData }, { data: productPresentationsData }] = productIds.length
    ? await Promise.all([
      supabase
        .from("product_suppliers")
        .select("product_id,supplier_id,supplier_product_alias,is_primary")
        .in("product_id", productIds),
      supabase
        .from("product_uom_profiles")
        .select("id,product_id,label,input_unit_code,qty_in_stock_unit,is_default")
        .in("product_id", productIds)
        .eq("source", "manual")
        .eq("usage_context", "general")
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("label", { ascending: true }),
    ])
    : [{ data: [] }, { data: [] }];
  const supplierIdsByProduct = new Map<string, Set<string>>();
  const supplierAliasesByProduct = new Map<string, Record<string, string>>();
  for (const row of (supplierLinksData ?? []) as Array<{ product_id: string; supplier_id: string; supplier_product_alias?: string | null; is_primary?: boolean | null }>) {
    const productId = String(row.product_id ?? "").trim();
    const supplierId = String(row.supplier_id ?? "").trim();
    if (!productId || !supplierId) continue;
    const current = supplierIdsByProduct.get(productId) ?? new Set<string>();
    current.add(supplierId);
    supplierIdsByProduct.set(productId, current);

    const alias = String(row.supplier_product_alias ?? "").trim();
    if (alias) {
      const aliases = supplierAliasesByProduct.get(productId) ?? {};
      aliases[supplierId] = alias;
      supplierAliasesByProduct.set(productId, aliases);
    }
  }
  const presentationsByProduct = new Map<string, ProductPresentationOption[]>();

  for (const row of (productPresentationsData ?? []) as ProductPresentationOption[]) {
    const productId = String(row.product_id ?? "").trim();
    if (!productId) continue;

    const current = presentationsByProduct.get(productId) ?? [];
    current.push({
      id: row.id,
      product_id: row.product_id,
      label: row.label,
      input_unit_code: row.input_unit_code,
      qty_in_stock_unit: Number(row.qty_in_stock_unit ?? 0),
      is_default: Boolean(row.is_default),
    });
    presentationsByProduct.set(productId, current);
  }

  const presentationIdByProductAndLabel = new Map<string, string>();

  for (const [productId, presentations] of presentationsByProduct.entries()) {
    for (const presentation of presentations) {
      const key = `${productId}::${normalizePresentationLabel(presentation.label)}`;
      if (!presentationIdByProductAndLabel.has(key)) {
        presentationIdByProductAndLabel.set(key, presentation.id);
      }
    }
  }

  const productsWithSupplierLinks = products.map((product) => ({
    ...product,
    supplier_ids: Array.from(supplierIdsByProduct.get(product.id) ?? []),
    supplier_aliases: supplierAliasesByProduct.get(product.id) ?? {},
    presentations: presentationsByProduct.get(product.id) ?? [],
  }));

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
        products={productsWithSupplierLinks}
        defaultValues={{
          supplier_id: order.supplier_id,
          site_id: order.site_id,
          expected_at: expectedAt,
          notes: order.notes ?? "",
          lines: lineItems.map((item) => {
            const unitLabel = String(item.unit ?? "").trim();
            const fallbackPresentationId = presentationIdByProductAndLabel.get(
              `${item.product_id}::${normalizePresentationLabel(unitLabel)}`
            );

            return {
              product_id: item.product_id,
              quantity: Number(item.quantity_ordered ?? 0),
              unit_cost: Number(item.unit_cost ?? 0),
              unit: unitLabel,
              presentation_id: item.input_uom_profile_id ?? fallbackPresentationId ?? "",
            };
          }),
        }}
      />
    </div>
  );
}
