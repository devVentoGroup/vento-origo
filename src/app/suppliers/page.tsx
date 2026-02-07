import Link from "next/link";

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
import { Button } from "@/components/vento/standard/ui";

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

type SearchParams = { q?: string; active?: string; error?: string };

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
  const errorParam = sp.error;

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
        <div className="ui-panel border-red-200 bg-red-50 dark:bg-red-950/20">
          <p className="text-red-700 dark:text-red-300">
            Error al cargar proveedores: {error.message}
          </p>
        </div>
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="ui-h1">Proveedores</h1>
          <p className="mt-2 ui-body-muted">
            Catálogo de proveedores para órdenes de compra. Crear y editar desde aquí.
          </p>
        </div>
        {canManageSuppliers && (
          <div>
            <Link href="/suppliers/new">
              <Button type="button" variant="brand">
                Nuevo proveedor
              </Button>
            </Link>
          </div>
        )}
      </div>

      {errorParam === "no_permission" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Solo propietarios y gerentes pueden crear o editar proveedores.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre, contacto, email..."
            className="h-12 min-w-[200px] rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-[var(--ui-text)] placeholder:text-[var(--ui-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
          />
          <select
            name="active"
            defaultValue={activeFilter === null ? "" : activeFilter ? "true" : "false"}
            className="h-12 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
          >
            <option value="">Todos (activos e inactivos)</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>
      </div>

      <div className="ui-panel overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="ui-empty-state">
            <div className="ui-h3">
              {allRows.length === 0 ? "Sin proveedores" : "Sin resultados"}
            </div>
            <p className="mt-2 ui-body-muted">
              {allRows.length === 0
                ? "Crea el primer proveedor con el botón «Nuevo proveedor»."
                : "Prueba otro criterio de búsqueda o filtro."}
            </p>
            {allRows.length === 0 && canManageSuppliers && (
              <Link href="/suppliers/new" className="mt-4">
                <Button type="button" variant="brand">
                  Nuevo proveedor
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Contacto</TableHeaderCell>
                <TableHeaderCell>Teléfono</TableHeaderCell>
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
                      <span className="ml-2 text-sm text-[var(--ui-muted)]">
                        NIT {row.tax_id}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.contact_name ?? "—"}</TableCell>
                  <TableCell>{row.phone ?? "—"}</TableCell>
                  <TableCell>{row.email ?? "—"}</TableCell>
                  <TableCell>
                    <span
                      className={
                        row.is_active
                          ? "text-[var(--ui-brand-600)]"
                          : "text-[var(--ui-muted)]"
                      }
                    >
                      {row.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {canManageSuppliers ? (
                      <Link
                        href={`/suppliers/${row.id}/edit`}
                        className="text-[var(--ui-brand-600)] hover:underline"
                      >
                        Editar
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
