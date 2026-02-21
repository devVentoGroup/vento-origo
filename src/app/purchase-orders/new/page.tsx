import Link from "next/link";

import { PurchaseOrderGuidedForm } from "@/components/vento/purchase-orders/purchase-order-guided-form";
import { requireAppAccess } from "@/lib/auth/guard";
import { normalizeSitesFromEmployeeSites, type EmployeeSiteRow } from "@/lib/supabase/employee-sites";
import { createPurchaseOrder } from "../actions";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RETURN_TO = "/login";

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
    supabase.from("products").select("id,name,sku,unit,stock_unit_code,cost").order("name").limit(500),
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
        products={products}
        defaultValues={prefillDefaults}
      />
    </div>
  );
}
