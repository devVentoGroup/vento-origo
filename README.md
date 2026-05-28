# ORIGO

ORIGO es la app Vento OS para compras, proveedores, ordenes de compra y recepciones.

## Estado actual

- Auth conectado con Supabase + Vento Shell.
- Rutas protegidas con permiso `origo.access`.
- Proveedores: listado, nuevo y edicion.
- Ordenes de compra: listado, nueva OC, detalle, edicion de borrador y PDF.
- Estados principales de OC: `draft`, `sent`, `received`.
- Recibos: rutas iniciales en `/receipts` y `/receipts/new`.
- Enlace operacional hacia Nexo para recibir una OC.

## Integracion con Nexo

Pendiente critico: Nexo debe consumir `purchase_order_id`, precargar lineas, registrar recepciones parciales/diferencias y devolver estado operativo a Origo. Hasta cerrar eso, Origo gestiona la compra pero la recepcion inventariable no esta totalmente sinergica.

## Contratos compartidos

Las tablas y migraciones compartidas viven en `vento-shell`, especialmente:

- `suppliers`
- `purchase_orders`
- `purchase_order_items`
- contratos futuros de recepcion/costos

## Desarrollo

```bash
npm install
npm run dev
```

Puerto local esperado: `3001`.

## Documentacion

- docs/ESTADO-ACTUAL-ORIGO-2026-05-28.md as estado operativo vigente.
