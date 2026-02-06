import Link from "next/link";

export default function NewPurchaseOrderPage() {
  return (
    <div className="w-full space-y-6">
      <div>
        <Link href="/purchase-orders" className="ui-caption text-[var(--ui-brand-600)] hover:underline">
          ← Volver a Órdenes de compra
        </Link>
        <h1 className="mt-2 ui-h1">Nueva orden de compra</h1>
        <p className="mt-2 ui-body-muted">
          Placeholder: formulario para crear OC (proveedor, ítems, cantidades, fechas). Se implementará cuando exista el modelo de datos y la vinculación con Nexo.
        </p>
      </div>

      <div className="ui-panel">
        <div className="ui-empty-state">
          <div className="ui-h3">Formulario en construcción</div>
          <p className="mt-2 ui-body-muted">
            Aquí irá: selector de proveedor, líneas de producto y cantidad, fecha esperada, notas. Al guardar se creará la OC y podrá referenciarse en <strong>Nexo → Entradas</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
