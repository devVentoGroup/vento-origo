# ORIGO — Órdenes de compra

App Vento OS para órdenes de compra y proveedores. **Auth conectado** (Supabase + Vento OS Shell); rutas protegidas con permiso `origo.access`. Proveedores y órdenes de compra usan las tablas del schema único (suppliers, purchase_orders, purchase_order_items).

**Paleta:** según `vento-shell/docs/APP-SHELL-ESTANDARES.md` — Base #ECFFF7 / #E0FFF1, texto #0B2A1F, accent principal #10B981, secundario #065F46, neutros #8FB8A9 / #D7EFE6.

## Auth

- **Middleware**: refresca sesión Supabase; redirige a Shell Login si no hay usuario (rutas públicas: `/login`, `/no-access`).
- **Guard**: `requireAppAccess({ appId: "origo", returnTo: "/login" })` en Panel, Órdenes de compra, Nueva orden, Detalle OC y Proveedores. Exige permiso `origo.access` vía RPC `has_permission`.
- **VentoShell**: lee `employees` y `employee_sites` del mismo Supabase para nombre, rol y sedes (como Nexo).
- **No acceso**: `/no-access?returnTo=...` con enlaces a Hub e inicio ORIGO.

Variables de entorno (igual que Nexo): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), `NEXT_PUBLIC_SHELL_LOGIN_URL` (opcional, default `https://os.ventogroup.co/login`).

## Estructura

- **Panel** (`/`) — Resumen y accesos (protegido).
- **Órdenes de compra** (`/purchase-orders`) — Listado con filtros por estado y sede (protegido).
- **Nueva orden** (`/purchase-orders/new`) — Formulario: proveedor, sede, fecha esperada, notas y hasta 15 líneas (producto, cantidad, costo unit., unidad). Se guarda en borrador.
- **Detalle OC** (`/purchase-orders/[id]`) — Cabecera, líneas, botón **Enviar** (draft → enviada) y enlace **Recibir en Nexo** (abre Nexo Entradas con `?purchase_order_id=...`).
- **Editar OC** (`/purchase-orders/[id]/edit`) — Solo para órdenes en borrador; permite cambiar cabecera y reemplazar líneas.
- **Proveedores** (`/suppliers`) — Listado, nuevo y editar (solo propietarios/gerentes pueden crear o editar).
- **Login** (`/login`) — Página informativa; el login real es en el Shell.
- **Sin acceso** (`/no-access`) — Sin permisos (pública para poder mostrarla tras redirect).

## Desarrollo

```bash
npm install
npm run dev
```

Abre [http://localhost:3001](http://localhost:3001) (puerto 3001 para no chocar con Nexo en 3000).

## Próximos pasos

- **Integración Nexo**  
  En Nexo, módulo **Entradas** (`/inventory/entries`): leer `purchase_order_id` de la URL; selector "Orden de compra" (OCs en estado sent); al elegir una OC, pre-cargar líneas como ítems y opcionalmente `receive_purchase_order` o `procurement_receptions`.

  Opcional: `NEXT_PUBLIC_NEXO_ENTRIES_URL` o `NEXT_PUBLIC_NEXO_URL` en Origo para que "Recibir en Nexo" apunte a tu Nexo.

(El CRUD de OC y proveedores ya está implementado.)  
   - **Listado** (`/purchase-orders`): tabla con número/referencia, proveedor, sede, estado (draft/sent/received), fechas, total; filtros por estado y sede.  
   - **Nueva OC** (`/purchase-orders/new`): formulario con supplier_id, site_id, expected_at, notes; líneas con product_id, quantity_ordered, unit_cost (y opcional cost_center_id).  
   - **Detalle** (`/purchase-orders/[id]`): cabecera + líneas, botón “Enviar” (draft → sent), enlace a “Recibir en Nexo” (Entradas con OC pre-cargada).  
   - Estados: `draft` (editable), `sent`, `received` (la función `receive_purchase_order` actualiza ítems y crea movimientos en Nexo).

3. **Integración Nexo**  
   En la app Nexo, módulo **Entradas** (`/inventory/entries` o similar): selector “Orden de compra” (lista OCs en estado sent o parcialmente recibidas); al elegir una OC, pre-cargar líneas como ítems de la entrada y opcionalmente llamar a `receive_purchase_order` o registrar recepción vía `procurement_receptions` + movimientos.
