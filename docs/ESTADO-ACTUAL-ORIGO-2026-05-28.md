# Estado actual ORIGO

Fecha: 2026-05-28
Rol: compras, proveedores, ordenes de compra y recepciones.

## Implementado

- Auth/SSO con Vento Shell y permiso `origo.access`.
- Proveedores: listado, alta y edicion.
- Ordenes de compra: listado, nueva OC, detalle, edicion de borrador y PDF.
- Estados base de OC: `draft`, `sent`, `received`.
- Token/PDF publico para compartir OC cuando aplique.
- Rutas iniciales de recibos: `/receipts` y `/receipts/new`.
- Enlace operacional hacia Nexo para recibir una OC.

## Pendiente para sinergia

1. Cerrar recepcion real contra OC en Nexo con `purchase_order_id`.
2. Soportar recepciones parciales, diferencias, costos y presentaciones fisicas.
3. Reflejar estado parcial/recibido en Origo sin doble digitacion.
4. Formalizar precios acordados por proveedor/producto.
5. Agregar aprobaciones y auditoria de cambios en OC.

## Regla de base de datos

Las tablas, RPCs, permisos y migraciones compartidas se gestionan desde `vento-shell`.
