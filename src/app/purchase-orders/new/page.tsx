import Link from "next/link";

import { PurchaseOrderGuidedForm } from "@/components/vento/purchase-orders/purchase-order-guided-form";
import { requireAppAccess } from "@/lib/auth/guard";
import { normalizeSitesFromEmployeeSites, type EmployeeSiteRow } from "@/lib/supabase/employee-sites";
import { createPurchaseOrder } from "../actions";

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

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; prefill?: string }>;
}) {
  const { supabase, user } = await requireAppAccess({ appId: APP_ID, returnTo: RETURN_TO });

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
        .select("product_id,supplier_id,is_primary")
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
  for (const row of (supplierLinksData ?? []) as Array<{ product_id: string; supplier_id: string; is_primary?: boolean | null }>) {
    const productId = String(row.product_id ?? "").trim();
    const supplierId = String(row.supplier_id ?? "").trim();
    if (!productId || !supplierId) continue;
    const current = supplierIdsByProduct.get(productId) ?? new Set<string>();
    current.add(supplierId);
    supplierIdsByProduct.set(productId, current);
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

  const productsWithSupplierLinks = products.map((product) => ({
    ...product,
    supplier_ids: Array.from(supplierIdsByProduct.get(product.id) ?? []),
    presentations: presentationsByProduct.get(product.id) ?? [],
  }));

  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error;
  let prefillDefaults:
    | {
      supplier_id?: string;
      site_id?: string;
      expected_at?: string;
      notes?: string | null;
      lines?: Array<{
        product_id?: string;
        quantity?: number | null;
        unit_cost?: number | null;
        unit?: string | null;
        presentation_id?: string | null;
      }>;
    }
    | undefined;

  if (sp.prefill) {
    try {
      const raw = Buffer.from(String(sp.prefill), "base64url").toString("utf-8");
      const parsed = JSON.parse(raw) as {
        supplier_id?: string;
        site_id?: string;
        expected_at?: string;
        notes?: string | null;
        lines?: Array<{
          product_id?: string;
          quantity?: number | null;
          unit_cost?: number | null;
          unit?: string | null;
          presentation_id?: string | null;
        }>;
      };
      prefillDefaults = {
        supplier_id: parsed.supplier_id,
        site_id: parsed.site_id,
        expected_at: parsed.expected_at,
        notes: parsed.notes ?? null,
        lines: Array.isArray(parsed.lines) ? parsed.lines : [],
      };
    } catch {
      // ignore malformed prefill payload
    }
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <Link href="/purchase-orders" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
          ← Ordenes de compra
        </Link>
        <h1 className="mt-2 ui-h1">Nueva orden de compra</h1>
        <p className="mt-2 ui-body-muted">
          Crea una orden en flujo guiado: cabecera, lineas y validacion final.
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
        mode="create"
        action={createPurchaseOrder}
        cancelHref="/purchase-orders"
        suppliers={suppliers}
        sites={sites}
        products={productsWithSupplierLinks}
        defaultValues={prefillDefaults}
      />
    </div>
  );
}
