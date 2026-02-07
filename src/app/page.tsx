import Link from "next/link";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RETURN_TO = "/login";

export default async function OrigoPanelPage() {
  await requireAppAccess({ appId: APP_ID, returnTo: RETURN_TO });
  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="ui-h1">ORIGO</h1>
        <p className="mt-2 ui-body-muted">
          Órdenes de compra y gestión de proveedores. Cuando haya inventario real y datos en la aplicación, aquí podrás crear OCs y vincular recepciones con Nexo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/purchase-orders" className="ui-panel block transition hover:shadow-lg">
          <div className="ui-h3">Órdenes de compra</div>
          <p className="mt-1 ui-body-muted">Listado y detalle de OC. Placeholder hasta conectar datos.</p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--ui-brand-600)]">Ir a Órdenes →</span>
        </Link>
        <Link href="/purchase-orders/new" className="ui-panel block transition hover:shadow-lg">
          <div className="ui-h3">Nueva orden</div>
          <p className="mt-1 ui-body-muted">Crear orden de compra. Placeholder.</p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--ui-brand-600)]">Nueva OC →</span>
        </Link>
        <Link href="/suppliers" className="ui-panel block transition hover:shadow-lg">
          <div className="ui-h3">Proveedores</div>
          <p className="mt-1 ui-body-muted">Catálogo de proveedores. Placeholder.</p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--ui-brand-600)]">Ir a Proveedores →</span>
        </Link>
      </div>

      <div className="ui-panel-soft">
        <div className="ui-caption font-semibold text-[var(--ui-muted)]">Estado</div>
        <p className="mt-2 ui-body-muted">
          App en modo placeholder. Conectar auth (Vento OS) y modelo de datos de OC cuando el inventario esté disponible; entonces Nexo podrá referenciar órdenes de compra en las entradas.
        </p>
      </div>
    </div>
  );
}
