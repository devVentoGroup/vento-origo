import Link from "next/link";

import { deleteSupplier } from "@/app/suppliers/actions";
import { requireAppAccess } from "@/lib/auth/guard";
import { ROLES_CAN_MANAGE_SUPPLIERS } from "@/lib/suppliers";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/vento/standard/table";

export const dynamic = "force-dynamic";

const APP_ID = "origo";
const RETURN_TO = "/login";

export type SupplierRow = {
  id: string;
  name: string;
  tax_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
};

type SearchParams = { q?: string; active?: string; error?: string; ok?: string };

export default async function SuppliersListPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { supabase, user } = await requireAppAccess({ appId: APP_ID, returnTo: RETURN_TO });

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (employee?.role as string) ?? "";
  const canManageSuppliers = ROLES_CAN_MANAGE_SUPPLIERS.includes(
    role as (typeof ROLES_CAN_MANAGE_SUPPLIERS)[number]
  );

  const sp = (await searchParams) ?? {};
  const q = String(sp.q ?? "").trim().toLowerCase();
  const activeFilter = sp.active === "false" ? false : sp.active === "true" ? true : null;
  const errorParam = sp.error ?? "";
  const okParam = sp.ok ?? "";

  let query = supabase
    .from("suppliers")
    .select("id,name,tax_id,contact_name,phone,email,address,notes,is_active,created_at,updated_at")
    .order("name", { ascending: true });

  if (activeFilter !== null) {
    query = query.eq("is_active", activeFilter);
  }

  const { data: rows, error } = await query;

  if (error) {
    return (
      <div className="w-full space-y-6">
        <h1 className="ui-h1">Proveedores</h1>
        <div className="ui-alert ui-alert--error">Error al cargar proveedores: {error.message}</div>
      </div>
    );
  }

  const allRows = (rows ?? []) as SupplierRow[];
  const filtered =
    q === ""
      ? allRows
      : allRows.filter(
          (r) =>
            r.name?.toLowerCase().includes(q) ||
            r.contact_name?.toLowerCase().includes(q) ||
            r.email?.toLowerCase().includes(q) ||
            r.tax_id?.toLowerCase().includes(q)
        );

  return (
    <div className="w-full space-y-6">
      <section className="ui-panel space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="ui-h1">Proveedores</h1>
            <p className="mt-2 ui-body-muted">
              Catalogo de proveedores para ordenes de compra. Crea, edita y filtra desde un flujo unico.
            </p>
          </div>
          {canManageSuppliers ? (
            <Link href="/suppliers/new" className="ui-btn ui-btn--brand">
              Nuevo proveedor
            </Link>
          ) : null}
        </div>

        {errorParam === "no_permission" ? (
          <div className="ui-alert ui-alert--warn">
            Solo propietarios y gerentes pueden crear, editar o eliminar proveedores.
          </div>
        ) : null}

        {errorParam === "supplier_has_orders" ? (
          <div className="ui-alert ui-alert--warn">
            No se puede eliminar el proveedor porque tiene ordenes de compra asociadas.
          </div>
        ) : null}

        {errorParam === "invalid_supplier" ? (
          <div className="ui-alert ui-alert--error">Proveedor invalido para eliminar.</div>
        ) : null}

        {okParam === "supplier_deleted" ? (
          <div className="ui-alert ui-alert--success">Proveedor eliminado correctamente.</div>
        ) : null}

        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="sm:col-span-2 lg:col-span-2">
            <span className="ui-label">Buscar proveedor</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Nombre, contacto, email o NIT"
              className="ui-input mt-1"
            />
          </label>
          <label>
            <span className="ui-label">Estado</span>
            <select
              name="active"
              defaultValue={activeFilter === null ? "" : activeFilter ? "true" : "false"}
              className="ui-input mt-1"
            >
              <option value="">Todos (activos e inactivos)</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="ui-btn ui-btn--brand">Aplicar</button>
            <Link href="/suppliers" className="ui-btn ui-btn--ghost">Limpiar</Link>
          </div>
        </form>
      </section>

      <section className="ui-panel overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="ui-empty-state">
            <div className="ui-h3">{allRows.length === 0 ? "Sin proveedores" : "Sin resultados"}</div>
            <p className="mt-2 ui-body-muted">
              {allRows.length === 0
                ? "Crea el primer proveedor con el boton Nuevo proveedor."
                : "Prueba otro criterio de busqueda o cambia el filtro de estado."}
            </p>
            {allRows.length === 0 && canManageSuppliers ? (
              <Link href="/suppliers/new" className="mt-4 ui-btn ui-btn--brand">
                Nuevo proveedor
              </Link>
            ) : null}
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Contacto</TableHeaderCell>
                <TableHeaderCell>Telefono</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell className="text-right">Acciones</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <span className="font-medium">{row.name}</span>
                    {row.tax_id ? (
                      <span className="ml-2 text-sm text-[var(--ui-muted)]">NIT {row.tax_id}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.contact_name ?? "-"}</TableCell>
                  <TableCell>{row.phone ?? "-"}</TableCell>
                  <TableCell>{row.email ?? "-"}</TableCell>
                  <TableCell>
                    <span className={row.is_active ? "ui-chip ui-chip--success" : "ui-chip"}>
                      {row.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {canManageSuppliers ? (
                      <div className="flex justify-end gap-2">
                        <Link href={`/suppliers/${row.id}/edit`} className="ui-btn ui-btn--ghost ui-btn--sm">
                          Editar
                        </Link>
                        <form action={deleteSupplier}>
                          <input type="hidden" name="supplier_id" value={row.id} />
                          <button
                            type="submit"
                            className="ui-btn ui-btn--ghost ui-btn--sm border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          >
                            Eliminar
                          </button>
                        </form>
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
