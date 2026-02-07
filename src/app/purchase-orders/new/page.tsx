import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { normalizeSitesFromEmployeeSites, type EmployeeSiteRow } from "@/lib/supabase/employee-sites";
import { Button, Input } from "@/components/vento/standard/ui";
import { createPurchaseOrder } from "../actions";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RETURN_TO = "/login";
const MAX_LINES = 15;

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const { supabase, user } = await requireAppAccess({ appId: APP_ID, returnTo: RETURN_TO });

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

  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error;

  return (
    <div className="w-full space-y-6">
      <div>
        <Link
          href="/purchase-orders"
          className="ui-caption text-[var(--ui-brand-600)] hover:underline"
        >
          ← Órdenes de compra
        </Link>
        <h1 className="mt-2 ui-h1">Nueva orden de compra</h1>
        <p className="mt-2 ui-body-muted">
          Elige proveedor, sede y añade líneas (producto, cantidad, costo). Puedes guardar en borrador y enviar después.
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {errorMsg === "supplier_site_required"
            ? "Proveedor y sede son obligatorios."
            : decodeURIComponent(errorMsg)}
        </div>
      )}

      <form action={createPurchaseOrder} className="space-y-6">
        <div className="ui-panel max-w-2xl space-y-4">
          <h2 className="ui-h3">Cabecera</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="supplier_id" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
                Proveedor *
              </label>
              <select
                id="supplier_id"
                name="supplier_id"
                required
                className="h-12 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
              >
                <option value="">Seleccionar…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="site_id" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
                Sede *
              </label>
              <select
                id="site_id"
                name="site_id"
                required
                className="h-12 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
              >
                <option value="">Seleccionar…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name ?? s.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="expected_at" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
                Fecha esperada
              </label>
              <Input id="expected_at" name="expected_at" type="date" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="notes" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
                Notas
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                className="h-auto w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 text-[var(--ui-text)] placeholder:text-[var(--ui-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
                placeholder="Referencia, observaciones…"
              />
            </div>
          </div>
        </div>

        <div className="ui-panel overflow-x-auto">
          <h2 className="ui-h3 mb-4">Líneas</h2>
          <p className="mb-4 text-sm text-[var(--ui-muted)]">
            Completa al menos una línea (producto, cantidad y costo unitario). Las líneas vacías se ignoran.
          </p>
          <table className="ui-table w-full">
            <thead>
              <tr>
                <th className="ui-th text-left">Producto</th>
                <th className="ui-th w-28 text-right">Cantidad</th>
                <th className="ui-th w-32 text-right">Costo unit.</th>
                <th className="ui-th w-24 text-left">Unidad</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: MAX_LINES }, (_, i) => (
                <tr key={i}>
                  <td className="ui-td">
                    <select
                      name={`item_${i}_product_id`}
                      className="h-11 w-full min-w-[200px] rounded border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
                    >
                      <option value="">—</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku ? `${p.sku} – ` : ""}{p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="ui-td text-right">
                    <input
                      type="number"
                      name={`item_${i}_quantity`}
                      min="0"
                      step="any"
                      placeholder="0"
                      className="h-11 w-full rounded border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-right text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
                    />
                  </td>
                  <td className="ui-td text-right">
                    <input
                      type="number"
                      name={`item_${i}_unit_cost`}
                      min="0"
                      step="0.01"
                      placeholder="0"
                      className="h-11 w-full rounded border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-right text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
                    />
                  </td>
                  <td className="ui-td">
                    <input
                      type="text"
                      name={`item_${i}_unit`}
                      placeholder="u"
                      className="h-11 w-20 rounded border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2 text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <Button type="submit" variant="brand">
            Crear orden (borrador)
          </Button>
          <Link href="/purchase-orders">
            <Button type="button" variant="secondary">
              Cancelar
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
