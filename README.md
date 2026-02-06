# ORIGO — Órdenes de compra

App Vento OS para órdenes de compra y proveedores. Actualmente **placeholder**: páginas y rutas listas para cuando exista inventario real y se conecte con Nexo (recepciones vinculadas a OC).

**Paleta:** según `vento-shell/docs/APP-SHELL-ESTANDARES.md` — Base #ECFFF7 / #E0FFF1, texto #0B2A1F, accent principal #10B981, secundario #065F46, neutros #8FB8A9 / #D7EFE6.

## Estructura

- **Panel** (`/`) — Resumen y accesos a Órdenes de compra y Proveedores.
- **Órdenes de compra** (`/purchase-orders`) — Listado (placeholder).
- **Nueva orden** (`/purchase-orders/new`) — Formulario crear OC (placeholder).
- **Detalle OC** (`/purchase-orders/[id]`) — Detalle y vínculo a recepción en Nexo (placeholder).
- **Proveedores** (`/suppliers`) — Catálogo (placeholder).

## Desarrollo

```bash
npm install
npm run dev
```

Abre [http://localhost:3001](http://localhost:3001) (puerto 3001 para no chocar con Nexo en 3000).

## Próximos pasos

1. Modelo de datos: tablas `purchase_orders` y `purchase_order_items` (o equivalente).
2. Auth: conectar con Vento OS / Supabase como en Nexo.
3. CRUD real de OC y proveedores.
4. Integración Nexo: en Entradas, selector "Orden de compra" y cargar ítems desde la OC.
