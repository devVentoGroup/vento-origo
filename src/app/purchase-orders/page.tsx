export default function PurchaseOrdersListPage() {
  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="ui-h1">Órdenes de compra</h1>
        <p className="mt-2 ui-body-muted">
          Listado de órdenes de compra. Placeholder: cuando exista el modelo de datos y la integración con inventario, aquí se listarán las OC (pendientes, aprobadas, recibidas).
        </p>
      </div>

      <div className="ui-panel">
        <div className="ui-empty-state">
          <div className="ui-h3">Sin órdenes</div>
          <p className="mt-2 ui-body-muted">
            No hay órdenes de compra cargadas. Crea una desde <strong>Nueva orden</strong> cuando el módulo esté conectado a datos.
          </p>
        </div>
      </div>
    </div>
  );
}
