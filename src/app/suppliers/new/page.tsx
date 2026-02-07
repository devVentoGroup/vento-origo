import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { requireCanManageSuppliers } from "@/lib/suppliers";
import { Button, Input } from "@/components/vento/standard/ui";
import { createSupplier } from "../actions";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RETURN_TO = "/login";

export default async function NewSupplierPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const { supabase, user } = await requireAppAccess({ appId: APP_ID, returnTo: RETURN_TO });
  await requireCanManageSuppliers(supabase, user.id);

  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error;

  return (
    <div className="w-full space-y-6">
      <div>
        <Link
          href="/suppliers"
          className="ui-caption text-[var(--ui-brand-600)] hover:underline"
        >
          ← Proveedores
        </Link>
        <h1 className="mt-2 ui-h1">Nuevo proveedor</h1>
        <p className="mt-2 ui-body-muted">
          Completa los datos del proveedor. Solo el nombre es obligatorio.
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {errorMsg === "name_required"
            ? "El nombre es obligatorio."
            : decodeURIComponent(errorMsg)}
        </div>
      )}

      <form action={createSupplier} className="ui-panel max-w-2xl space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
              Nombre *
            </label>
            <Input id="name" name="name" required placeholder="Razón social o nombre" />
          </div>
          <div>
            <label htmlFor="tax_id" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
              NIT / Identificación tributaria
            </label>
            <Input id="tax_id" name="tax_id" placeholder="Ej. 900.123.456-7" />
          </div>
          <div>
            <label
              htmlFor="contact_name"
              className="mb-1 block text-sm font-medium text-[var(--ui-text)]"
            >
              Contacto
            </label>
            <Input id="contact_name" name="contact_name" placeholder="Nombre del contacto" />
          </div>
          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
              Teléfono
            </label>
            <Input id="phone" name="phone" type="tel" placeholder="Ej. +57 300 123 4567" />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
              Email
            </label>
            <Input id="email" name="email" type="email" placeholder="correo@proveedor.com" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="address" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
              Dirección
            </label>
            <Input id="address" name="address" placeholder="Dirección fiscal o de entrega" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="notes" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
              Notas
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Condiciones, horarios, observaciones..."
              className="h-auto w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 text-[var(--ui-text)] placeholder:text-[var(--ui-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input type="hidden" name="is_active" value="false" />
            <input
              type="checkbox"
              id="is_active"
              name="is_active"
              value="true"
              defaultChecked
              className="h-4 w-4 rounded border-[var(--ui-border)] text-[var(--ui-brand)] focus:ring-[var(--ui-brand)]/30"
            />
            <label htmlFor="is_active" className="text-sm text-[var(--ui-text)]">
              Proveedor activo
            </label>
          </div>
        </div>
        <div className="flex gap-3">
          <Button type="submit" variant="brand">
            Crear proveedor
          </Button>
          <Link href="/suppliers">
            <Button type="button" variant="secondary">
              Cancelar
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
