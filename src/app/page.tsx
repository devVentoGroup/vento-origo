import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RETURN_TO = "/login";

export default async function OrigoPanelPage() {
  await requireAppAccess({ appId: APP_ID, returnTo: RETURN_TO });

  return (
    <div className="w-full space-y-6">
      <section className="ui-panel space-y-3">
        <h1 className="ui-h1">ORIGO</h1>
        <p className="ui-body-muted">
          Ordenes de compra y gestion de proveedores. Desde aqui controlas compras, borradores,
          envios y recepcion integrada con Nexo.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/purchase-orders" className="ui-panel block transition hover:shadow-lg">
          <div className="ui-h3">Ordenes de compra</div>
          <p className="mt-1 ui-body-muted">Listado, estado y seguimiento operativo de OCs.</p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--ui-brand-600)]">Ir a ordenes</span>
        </Link>

        <Link href="/purchase-orders/new" className="ui-panel block transition hover:shadow-lg">
          <div className="ui-h3">Nueva orden</div>
          <p className="mt-1 ui-body-muted">Crear OC con flujo guiado y validacion previa.</p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--ui-brand-600)]">Crear nueva</span>
        </Link>

        <Link href="/suppliers" className="ui-panel block transition hover:shadow-lg">
          <div className="ui-h3">Proveedores</div>
          <p className="mt-1 ui-body-muted">Catalogo y ficha de proveedores con formulario estandar.</p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--ui-brand-600)]">Ir a proveedores</span>
        </Link>
      </section>

      <section className="ui-panel-soft">
        <div className="ui-caption font-semibold text-[var(--ui-muted)]">Estado</div>
        <p className="mt-2 ui-body-muted">
          Modulo estandarizado con Vento OS. Las ordenes enviadas se pueden recibir en Nexo para
          continuar el flujo de entradas y conciliacion.
        </p>
      </section>
    </div>
  );
}

