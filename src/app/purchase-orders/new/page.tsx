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

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  cost: number | null;
  product_type?: string | null;
  is_active?: boolean | null;
};

type ProductSupplierLinkRow = {
  product_id: string;
  supplier_id: string;
  supplier_product_alias?: string | null;
  is_primary?: boolean | null;
  products?: ProductRow | ProductRow[] | null;
};

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function sortByNameSku<T extends { name?: string | null; sku?: string | null }>(rows: T[]) {
  return rows.sort((a, b) => {
    const aLabel = `${a.name ?? ""} ${a.sku ?? ""}`.trim();
    const bLabel = `${b.name ?? ""} ${b.sku ?? ""}`.trim();
    return aLabel.localeCompare(bLabel, "es", { sensitivity: "base" });
  });
}

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; prefill?: string }>;
}) {
  const { supabase, user } = await requireAppAccess({ appId: APP_ID, returnTo: RETURN_TO });

  const [suppliersRes, sitesRes] = await Promise.all([
    supabase.from("suppliers").select("id,name").eq("is_active", true).order("name"),
    supabase
      .from("employee_sites")
      .select("site_id,sites(id,name)")
      .eq("employee_id", user.id)
      .eq("is_active", true),
  ]);

  const suppliers = (suppliersRes.data ?? []) as { id: string; name: string }[];
  const sites = normalizeSitesFromEmployeeSites(sitesRes.data as EmployeeSiteRow[]);
  const activeSupplierIds = suppliers.map((supplier) => supplier.id).filter(Boolean);

  const supplierProductsRes = activeSupplierIds.length
    ? await supabase
        .from("product_suppliers")
        .select(
          `
          product_id,
          supplier_id,
          supplier_product_alias,
          is_primary,
          products!inner(
            id,
            name,
            sku,
            unit,
            stock_unit_code,
            cost,
            product_type,
            is_active
          )
        `
        )
        .in("supplier_id", activeSupplierIds)
        .eq("products.is_active", true)
        .eq("products.product_type", "insumo")
    : { data: [] as ProductSupplierLinkRow[], error: null };

  const supplierProducts = (supplierProductsRes.data ?? []) as ProductSupplierLinkRow[];

  const productById = new Map<string, ProductRow>();
  const supplierIdsByProduct = new Map<string, Set<string>>();
  const supplierAliasesByProduct = new Map<string, Record<string, string>>();

  for (const row of supplierProducts) {
    const product = firstRelated(row.products);
    const productId = String(row.product_id ?? product?.id ?? "").trim();
    const supplierId = String(row.supplier_id ?? "").trim();

    if (!product || !productId || !supplierId) continue;
    if (product.is_active === false) continue;
    if (String(product.product_type ?? "").trim().toLowerCase() !== "insumo") continue;

    productById.set(productId, {
      id: productId,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      stock_unit_code: product.stock_unit_code,
      cost: product.cost,
      product_type: product.product_type,
      is_active: product.is_active,
    });

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

  const productIds = Array.from(productById.keys());

  const productPresentationsRes = productIds.length
    ? await supabase
        .from("product_uom_profiles")
        .select("id,product_id,label,input_unit_code,qty_in_stock_unit,is_default,source,usage_context")
        .in("product_id", productIds)
        .eq("is_active", true)
        .eq("source", "manual")
        .order("usage_context", { ascending: true })
        .order("is_default", { ascending: false })
        .order("label", { ascending: true })
    : { data: [] as Array<ProductPresentationOption & { source?: string | null; usage_context?: string | null }>, error: null };

  const presentationsByProduct = new Map<string, ProductPresentationOption[]>();

  for (const row of (productPresentationsRes.data ?? []) as Array<
    ProductPresentationOption & { source?: string | null; usage_context?: string | null }
  >) {
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

  const productsWithSupplierLinks = sortByNameSku(
    Array.from(productById.values()).map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      stock_unit_code: product.stock_unit_code,
      cost: product.cost,
      supplier_ids: Array.from(supplierIdsByProduct.get(product.id) ?? []),
      supplier_aliases: supplierAliasesByProduct.get(product.id) ?? {},
      presentations: presentationsByProduct.get(product.id) ?? [],
    }))
  );

  const dataErrorMsg =
    suppliersRes.error?.message ??
    sitesRes.error?.message ??
    supplierProductsRes.error?.message ??
    productPresentationsRes.error?.message ??
    null;

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
          Crea una orden desde proveedores configurados. ORIGO solo muestra insumos vinculados al proveedor
          y cualquier presentación manual activa configurada para el insumo.
        </p>
      </div>

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">
          {errorMsg === "supplier_site_required"
            ? "Proveedor y sede son obligatorios."
            : decodeURIComponent(errorMsg)}
        </div>
      ) : null}

      {dataErrorMsg ? (
        <div className="ui-alert ui-alert--error">
          No se pudo cargar la configuración de compras: {dataErrorMsg}
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
