import Link from "next/link";

import { SupplierGuidedForm } from "@/components/vento/suppliers/supplier-guided-form";
import { requireAppAccess } from "@/lib/auth/guard";
import { requireCanManageSuppliers } from "@/lib/suppliers";
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/suppliers" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
            ← Proveedores
          </Link>
          <h1 className="mt-2 ui-h1">Nuevo proveedor</h1>
          <p className="mt-2 ui-body-muted">
            Crea el proveedor con un flujo guiado y valida antes de guardar.
          </p>
        </div>
      </div>

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">
          {errorMsg === "name_required" ? "El nombre es obligatorio." : decodeURIComponent(errorMsg)}
        </div>
      ) : null}

      <SupplierGuidedForm mode="create" action={createSupplier} cancelHref="/suppliers" />
    </div>
  );
}
