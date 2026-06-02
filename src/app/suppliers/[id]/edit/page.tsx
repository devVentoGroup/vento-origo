import Link from "next/link";

import { SupplierGuidedForm } from "@/components/vento/suppliers/supplier-guided-form";
import { requireAppAccess } from "@/lib/auth/guard";
import { requireCanManageSuppliers } from "@/lib/suppliers";
import { updateSupplier } from "../../actions";
import type { SupplierRow } from "../../page";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RETURN_TO = "/login";

type SupplierPaymentType = "cash" | "credit";

type SupplierWithPaymentTerms = SupplierRow & {
  payment_type?: SupplierPaymentType | null;
  credit_days?: number | string | null;
};

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
    .select("id,name,tax_id,contact_name,phone,email,address,notes,is_active,payment_type,credit_days")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <div className="w-full space-y-6">
        <Link href="/suppliers" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
          ← Proveedores
        </Link>
        <div className="ui-alert ui-alert--error">Error al cargar proveedor: {error.message}</div>
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
          <Link href="/suppliers" className="mt-4 inline-block ui-btn ui-btn--ghost">
            Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  const supplier = row as SupplierWithPaymentTerms;

  return (
    <div className="w-full space-y-6">
      <div>
        <Link href="/suppliers" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
          ← Proveedores
        </Link>
        <h1 className="mt-2 ui-h1">Editar proveedor</h1>
        <p className="mt-2 ui-body-muted">
          Actualiza la ficha comercial, los datos de contacto y las condiciones de pago de{" "}
          {supplier.name}.
        </p>
      </div>

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">
          {errorMsg === "name_required" ? "El nombre es obligatorio." : decodeURIComponent(errorMsg)}
        </div>
      ) : null}

      <SupplierGuidedForm
        mode="edit"
        action={updateSupplier.bind(null, id)}
        cancelHref="/suppliers"
        defaultValues={{
          name: supplier.name,
          tax_id: supplier.tax_id,
          contact_name: supplier.contact_name,
          phone: supplier.phone,
          email: supplier.email,
          address: supplier.address,
          notes: supplier.notes,
          is_active: supplier.is_active,
          payment_type: supplier.payment_type,
          credit_days: supplier.credit_days,
        }}
      />
    </div>
  );
}
