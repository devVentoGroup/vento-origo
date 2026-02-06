import Link from "next/link";

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="w-full space-y-6">
      <div>
        <Link href="/purchase-orders" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
          ← Volver a Órdenes de compra
        </Link>
        <h1 className="mt-2 ui-h1">Orden de compra</h1>
        <p className="mt-1 font-mono text-sm text-[var(--ui-muted)]">ID: {id}</p>
        <p className="mt-2 ui-body-muted">
          Placeholder: detalle de la OC (proveedor, ítems, cantidades, estado, recepciones en Nexo). Se implementará con el modelo de datos.
        </p>
      </div>

      <div className="ui-panel">
        <div className="ui-empty-state">
          <div className="ui-h3">Detalle en construcción</div>
          <p className="mt-2 ui-body-muted">
            Aquí se mostrará la OC y un enlace a <strong>Recibir en Nexo</strong> para abrir la entrada vinculada a esta orden.
          </p>
        </div>
      </div>
    </div>
  );
}
