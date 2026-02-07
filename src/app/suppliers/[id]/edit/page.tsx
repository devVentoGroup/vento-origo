import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { requireCanManageSuppliers } from "@/lib/suppliers";
import { Button, Input } from "@/components/vento/standard/ui";
import { updateSupplier } from "../../actions";
import type { SupplierRow } from "../../page";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RETURN_TO = "/login";

export default async function EditSupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { supabase, user } = await requireAppAccess({ appId: APP_ID, returnTo: RETURN_TO });
  await requireCanManageSuppliers(supabase, user.id);
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error;

  const { data: row, error } = await supabase
    .from("suppliers")
    .select("id,name,tax_id,contact_name,phone,email,address,notes,is_active")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <div className="w-full space-y-6">
        <Link href="/suppliers" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
          ← Proveedores
        </Link>
        <div className="ui-panel border-red-200 bg-red-50 dark:bg-red-950/20">
          <p className="text-red-700 dark:text-red-300">Error: {error.message}</p>
        </div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="w-full space-y-6">
        <Link href="/suppliers" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
          ← Proveedores
        </Link>
        <div className="ui-panel">
          <p className="ui-body-muted">Proveedor no encontrado.</p>
          <Link href="/suppliers" className="mt-4 inline-block">
            <Button variant="secondary">Volver al listado</Button>
          </Link>
        </div>
      </div>
    );
  }

  const supplier = row as SupplierRow;

  return (
    <div className="w-full space-y-6">
      <div>
        <Link
          href="/suppliers"
          className="ui-caption text-[var(--ui-brand-600)] hover:underline"
        >
          ← Proveedores
        </Link>
        <h1 className="mt-2 ui-h1">Editar proveedor</h1>
        <p className="mt-2 ui-body-muted">
          Modifica los datos de {supplier.name}.
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {errorMsg === "name_required"
            ? "El nombre es obligatorio."
            : decodeURIComponent(errorMsg)}
        </div>
      )}

      <form
        action={updateSupplier.bind(null, id)}
        className="ui-panel max-w-2xl space-y-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
              Nombre *
            </label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={supplier.name}
              placeholder="Razón social o nombre"
            />
          </div>
          <div>
            <label htmlFor="tax_id" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
              NIT / Identificación tributaria
            </label>
            <Input
              id="tax_id"
              name="tax_id"
              defaultValue={supplier.tax_id ?? ""}
              placeholder="Ej. 900.123.456-7"
            />
          </div>
          <div>
            <label
              htmlFor="contact_name"
              className="mb-1 block text-sm font-medium text-[var(--ui-text)]"
            >
              Contacto
            </label>
            <Input
              id="contact_name"
              name="contact_name"
              defaultValue={supplier.contact_name ?? ""}
              placeholder="Nombre del contacto"
            />
          </div>
          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
              Teléfono
            </label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={supplier.phone ?? ""}
              placeholder="Ej. +57 300 123 4567"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={supplier.email ?? ""}
              placeholder="correo@proveedor.com"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="address" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
              Dirección
            </label>
            <Input
              id="address"
              name="address"
              defaultValue={supplier.address ?? ""}
              placeholder="Dirección fiscal o de entrega"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="notes" className="mb-1 block text-sm font-medium text-[var(--ui-text)]">
              Notas
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={supplier.notes ?? ""}
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
              defaultChecked={supplier.is_active}
              className="h-4 w-4 rounded border-[var(--ui-border)] text-[var(--ui-brand)] focus:ring-[var(--ui-brand)]/30"
            />
            <label htmlFor="is_active" className="text-sm text-[var(--ui-text)]">
              Proveedor activo
            </label>
          </div>
        </div>
        <div className="flex gap-3">
          <Button type="submit" variant="brand">
            Guardar cambios
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
