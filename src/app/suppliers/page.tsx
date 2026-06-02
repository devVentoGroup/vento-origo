import Link from "next/link";

import { deleteSupplier } from "@/app/suppliers/actions";
import { requireAppAccess } from "@/lib/auth/guard";
import { canManageSuppliers as getCanManageSuppliers } from "@/lib/suppliers";
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

type SupplierPaymentType = "cash" | "credit";

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
  payment_type: SupplierPaymentType | null;
  credit_days: number | null;
  created_at: string;
  updated_at: string | null;
};

type SearchParams = {
  q?: string;
  active?: string;
  payment?: string;
  error?: string;
  ok?: string;
};

function normalizePaymentType(value: string | null | undefined): SupplierPaymentType {
  return value === "credit" ? "credit" : "cash";
}

function paymentLabel(row: Pick<SupplierRow, "payment_type" | "credit_days">): string {
  const paymentType = normalizePaymentType(row.payment_type);

  if (paymentType === "credit") {
    return row.credit_days ? `Crédito · ${row.credit_days} días` : "Crédito";
  }

  return "Contado";
}

function paymentBadgeClass(row: Pick<SupplierRow, "payment_type">): string {
  const paymentType = normalizePaymentType(row.payment_type);

  if (paymentType === "credit") {
    return "border-[var(--ui-brand)]/30 bg-[var(--ui-brand)]/10 text-[var(--ui-brand-700)]";
  }

  return "border-[var(--ui-success)]/30 bg-[var(--ui-success)]/10 text-[var(--ui-success)]";
}

export default async function SuppliersListPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { supabase, user } = await requireAppAccess({ appId: APP_ID, returnTo: RETURN_TO });

  const canManageSuppliers = await getCanManageSuppliers(supabase, user.id);

  const sp = (await searchParams) ?? {};
  const q = String(sp.q ?? "").trim().toLowerCase();
  const activeFilter = sp.active === "false" ? false : sp.active === "true" ? true : null;
  const paymentFilter: SupplierPaymentType | null =
    sp.payment === "cash" || sp.payment === "credit" ? sp.payment : null;
  const errorParam = sp.error ?? "";
  const okParam = sp.ok ?? "";

  let query = supabase
    .from("suppliers")
    .select(
      "id,name,tax_id,contact_name,phone,email,address,notes,is_active,payment_type,credit_days,created_at,updated_at"
    )
    .order("name", { ascending: true });

  if (activeFilter !== null) {
    query = query.eq("is_active", activeFilter);
  }

  if (paymentFilter !== null) {
    query = query.eq("payment_type", paymentFilter);
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
      : allRows.filter((r) => {
          const paymentText = paymentLabel(r).toLowerCase();
          return (
            r.name?.toLowerCase().includes(q) ||
            r.contact_name?.toLowerCase().includes(q) ||
            r.email?.toLowerCase().includes(q) ||
            r.tax_id?.toLowerCase().includes(q) ||
            paymentText.includes(q)
          );
        });

  const activeCount = allRows.filter((row) => row.is_active).length;
  const creditCount = allRows.filter((row) => normalizePaymentType(row.payment_type) === "credit").length;
  const cashCount = allRows.filter((row) => normalizePaymentType(row.payment_type) === "cash").length;

  return (
    <div className="w-full space-y-6">
      <section className="ui-panel space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="ui-h1">Proveedores</h1>
            <p className="mt-2 ui-body-muted">
              Catálogo de proveedores para órdenes de compra. Administra contactos, estado y condiciones
              de pago desde una ficha única.
            </p>
          </div>
          {canManageSuppliers ? (
            <Link href="/suppliers/new" className="ui-btn ui-btn--brand">
              Nuevo proveedor
            </Link>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Total</div>
            <div className="mt-1 text-2xl font-semibold">{allRows.length}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Activos</div>
            <div className="mt-1 text-2xl font-semibold">{activeCount}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Contado</div>
            <div className="mt-1 text-2xl font-semibold">{cashCount}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Crédito</div>
            <div className="mt-1 text-2xl font-semibold">{creditCount}</div>
          </div>
        </div>

        {errorParam === "no_permission" ? (
          <div className="ui-alert ui-alert--warn">
            No tienes permiso para crear, editar o eliminar proveedores.
          </div>
        ) : null}

        {errorParam === "supplier_has_orders" ? (
          <div className="ui-alert ui-alert--warn">
            No se puede eliminar el proveedor porque tiene órdenes de compra asociadas.
          </div>
        ) : null}

        {errorParam === "invalid_supplier" ? (
          <div className="ui-alert ui-alert--error">Proveedor inválido para eliminar.</div>
        ) : null}

        {okParam === "supplier_deleted" ? (
          <div className="ui-alert ui-alert--success">Proveedor eliminado correctamente.</div>
        ) : null}

        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="sm:col-span-2">
            <span className="ui-label">Buscar proveedor</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Nombre, contacto, email, NIT o condición de pago"
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
              <option value="">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
          </label>
          <label>
            <span className="ui-label">Condición</span>
            <select name="payment" defaultValue={paymentFilter ?? ""} className="ui-input mt-1">
              <option value="">Todas</option>
              <option value="cash">Contado</option>
              <option value="credit">Crédito</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="ui-btn ui-btn--brand">
              Aplicar
            </button>
            <Link href="/suppliers" className="ui-btn ui-btn--ghost">
              Limpiar
            </Link>
          </div>
        </form>
      </section>

      <section className="ui-panel overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="ui-empty-state">
            <div className="ui-h3">{allRows.length === 0 ? "Sin proveedores" : "Sin resultados"}</div>
            <p className="mt-2 ui-body-muted">
              {allRows.length === 0
                ? "Crea el primer proveedor con el botón Nuevo proveedor."
                : "Prueba otro criterio de búsqueda o cambia los filtros."}
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
                <TableHeaderCell>Teléfono</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Condición</TableHeaderCell>
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
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${paymentBadgeClass(row)}`}
                    >
                      {paymentLabel(row)}
                    </span>
                  </TableCell>
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
