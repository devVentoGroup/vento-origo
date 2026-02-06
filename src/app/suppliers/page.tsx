export default function SuppliersListPage() {
  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="ui-h1">Proveedores</h1>
        <p className="mt-2 ui-body-muted">
          Catálogo de proveedores para órdenes de compra. Placeholder: cuando exista el modelo (o se reutilice el de Nexo), aquí se listarán y podrán asignarse a las OC.
        </p>
      </div>

      <div className="ui-panel">
        <div className="ui-empty-state">
          <div className="ui-h3">Sin proveedores</div>
          <p className="mt-2 ui-body-muted">
            No hay proveedores cargados. Puede reutilizarse la tabla <code className="rounded bg-[var(--ui-surface-2)] px-1">suppliers</code> de Nexo o crear un módulo propio en ORIGO.
          </p>
        </div>
      </div>
    </div>
  );
}
