"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type SupplierPaymentType = "cash" | "credit";

type SupplierGuidedFormProps = {
  mode: "create" | "edit";
  action: (formData: FormData) => void | Promise<void>;
  cancelHref: string;
  defaultValues?: {
    name?: string;
    tax_id?: string | null;
    contact_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
    is_active?: boolean;
    payment_type?: SupplierPaymentType | null;
    credit_days?: number | string | null;
  };
};

function normalizePaymentType(value: unknown): SupplierPaymentType {
  return value === "credit" ? "credit" : "cash";
}

function normalizeCreditDays(value: unknown): string {
  if (value === null || value === undefined) return "";
  const normalized = String(value).trim();
  return normalized === "0" ? "" : normalized;
}

function paymentTypeLabel(paymentType: SupplierPaymentType, creditDays: string): string {
  if (paymentType === "credit") {
    return creditDays.trim().length > 0 ? `Crédito · ${creditDays.trim()} días` : "Crédito";
  }

  return "Contado";
}

export function SupplierGuidedForm({
  mode,
  action,
  cancelHref,
  defaultValues,
}: SupplierGuidedFormProps) {
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [taxId, setTaxId] = useState(defaultValues?.tax_id ?? "");
  const [contactName, setContactName] = useState(defaultValues?.contact_name ?? "");
  const [phone, setPhone] = useState(defaultValues?.phone ?? "");
  const [email, setEmail] = useState(defaultValues?.email ?? "");
  const [address, setAddress] = useState(defaultValues?.address ?? "");
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [isActive, setIsActive] = useState(defaultValues?.is_active ?? true);
  const [paymentType, setPaymentType] = useState<SupplierPaymentType>(
    normalizePaymentType(defaultValues?.payment_type)
  );
  const [creditDays, setCreditDays] = useState(normalizeCreditDays(defaultValues?.credit_days));

  const canSubmit = name.trim().length > 0;
  const normalizedCreditDays = paymentType === "credit" ? creditDays.trim() : "";

  const summary = useMemo(
    () => ({
      name: name.trim() || "Sin definir",
      taxId: taxId.trim() || "Sin definir",
      contactName: contactName.trim() || "Sin definir",
      phone: phone.trim() || "Sin definir",
      email: email.trim() || "Sin definir",
      address: address.trim() || "Sin definir",
      notes: notes.trim() || "Sin definir",
      status: isActive ? "Activo" : "Inactivo",
      paymentTerms: paymentTypeLabel(paymentType, creditDays),
    }),
    [name, taxId, contactName, phone, email, address, notes, isActive, paymentType, creditDays]
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="tax_id" value={taxId} />
      <input type="hidden" name="contact_name" value={contactName} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="address" value={address} />
      <input type="hidden" name="notes" value={notes} />
      <input type="hidden" name="is_active" value="false" />
      <input type="hidden" name="is_active" value={isActive ? "true" : "false"} />
      <input type="hidden" name="payment_type" value={paymentType} />
      <input type="hidden" name="credit_days" value={normalizedCreditDays} />

      <section className="overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-white shadow-sm">
        <div className="border-b border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="ui-caption">ORIGO · Proveedores</div>
              <h2 className="mt-1 ui-h2">
                {mode === "edit" ? "Ficha comercial del proveedor" : "Crear ficha comercial"}
              </h2>
              <p className="mt-1 ui-body-muted">
                Registra la identidad, contacto, operación y condiciones de pago en una sola vista.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  isActive
                    ? "border-[var(--ui-success)] bg-[var(--ui-success)]/10 text-[var(--ui-success)]"
                    : "border-[var(--ui-border)] bg-white text-[var(--ui-muted)]"
                }`}
              >
                {summary.status}
              </span>
              <span className="rounded-full border border-[var(--ui-brand)]/30 bg-[var(--ui-brand)]/10 px-3 py-1 text-xs font-semibold text-[var(--ui-brand-700)]">
                {summary.paymentTerms}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="ui-panel space-y-4">
              <div>
                <div className="ui-h3">Identidad fiscal</div>
                <p className="mt-1 ui-caption">Datos base para reconocer al proveedor en compras y documentos.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="ui-label">Nombre *</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="ui-input mt-1"
                    placeholder="Razón social o nombre"
                    required
                  />
                </label>

                <label>
                  <span className="ui-label">NIT / Identificación tributaria</span>
                  <input
                    value={taxId}
                    onChange={(event) => setTaxId(event.target.value)}
                    className="ui-input mt-1"
                    placeholder="Ej. 900.123.456-7"
                  />
                </label>

                <label className="flex items-center gap-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(event) => setIsActive(event.target.checked)}
                    className="h-4 w-4 rounded border-[var(--ui-border)] text-[var(--ui-brand)] focus:ring-[var(--ui-brand)]/30"
                  />
                  <span>
                    <span className="ui-label block">Proveedor activo</span>
                    <span className="ui-caption">Disponible para órdenes y operaciones.</span>
                  </span>
                </label>
              </div>
            </section>

            <section className="ui-panel space-y-4">
              <div>
                <div className="ui-h3">Contacto</div>
                <p className="mt-1 ui-caption">Canales para confirmar pedidos, novedades y tiempos de entrega.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="ui-label">Contacto</span>
                  <input
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                    className="ui-input mt-1"
                    placeholder="Nombre del contacto"
                  />
                </label>

                <label>
                  <span className="ui-label">Teléfono</span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="ui-input mt-1"
                    placeholder="Ej. +57 300 123 4567"
                  />
                </label>

                <label className="sm:col-span-2">
                  <span className="ui-label">Email</span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="ui-input mt-1"
                    type="email"
                    placeholder="correo@proveedor.com"
                  />
                </label>
              </div>
            </section>

            <section className="ui-panel space-y-4">
              <div>
                <div className="ui-h3">Condiciones comerciales</div>
                <p className="mt-1 ui-caption">Define si el proveedor se maneja a contado o con crédito.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPaymentType("cash")}
                  className={`rounded-[var(--ui-radius-control)] border p-4 text-left transition-colors ${
                    paymentType === "cash"
                      ? "border-[var(--ui-brand)] bg-[var(--ui-brand)]/10"
                      : "border-[var(--ui-border)] bg-[var(--ui-surface-2)] hover:border-[var(--ui-brand)]/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[var(--ui-text)]">Contado</div>
                      <div className="ui-caption mt-1">Pago inmediato, contra entrega o sin plazo pactado.</div>
                    </div>
                    <div
                      className={`mt-1 h-3 w-3 rounded-full border ${
                        paymentType === "cash"
                          ? "border-[var(--ui-brand)] bg-[var(--ui-brand)]"
                          : "border-[var(--ui-border)] bg-white"
                      }`}
                    />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType("credit")}
                  className={`rounded-[var(--ui-radius-control)] border p-4 text-left transition-colors ${
                    paymentType === "credit"
                      ? "border-[var(--ui-brand)] bg-[var(--ui-brand)]/10"
                      : "border-[var(--ui-border)] bg-[var(--ui-surface-2)] hover:border-[var(--ui-brand)]/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[var(--ui-text)]">Crédito</div>
                      <div className="ui-caption mt-1">Proveedor con plazo de pago acordado.</div>
                    </div>
                    <div
                      className={`mt-1 h-3 w-3 rounded-full border ${
                        paymentType === "credit"
                          ? "border-[var(--ui-brand)] bg-[var(--ui-brand)]"
                          : "border-[var(--ui-border)] bg-white"
                      }`}
                    />
                  </div>
                </button>
              </div>

              {paymentType === "credit" ? (
                <label className="block max-w-xs">
                  <span className="ui-label">Días de crédito</span>
                  <input
                    value={creditDays}
                    onChange={(event) => setCreditDays(event.target.value)}
                    className="ui-input mt-1"
                    inputMode="numeric"
                    min={1}
                    placeholder="Ej. 15, 30, 45"
                    type="number"
                  />
                </label>
              ) : (
                <div className="ui-alert ui-alert--info">
                  Al guardar como contado, los días de crédito se enviarán vacíos.
                </div>
              )}
            </section>

            <section className="ui-panel space-y-4">
              <div>
                <div className="ui-h3">Operación</div>
                <p className="mt-1 ui-caption">Información útil para recepción, entregas y comunicación interna.</p>
              </div>

              <div className="grid gap-4">
                <label>
                  <span className="ui-label">Dirección</span>
                  <input
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    className="ui-input mt-1"
                    placeholder="Dirección fiscal o de entrega"
                  />
                </label>

                <label>
                  <span className="ui-label">Notas</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 text-[var(--ui-text)] placeholder:text-[var(--ui-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
                    placeholder="Condiciones, horarios, mínimos, observaciones..."
                  />
                </label>
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
            <section className="ui-panel-soft space-y-3 p-4">
              <div>
                <div className="ui-h3">Resumen</div>
                <p className="mt-1 ui-caption">Vista rápida antes de guardar.</p>
              </div>

              <div className="space-y-2">
                <div className="rounded-lg bg-white p-3">
                  <div className="ui-caption">Proveedor</div>
                  <div className="font-semibold">{summary.name}</div>
                </div>

                <div className="rounded-lg bg-white p-3">
                  <div className="ui-caption">Condición de pago</div>
                  <div className="font-semibold">{summary.paymentTerms}</div>
                </div>

                <div className="rounded-lg bg-white p-3">
                  <div className="ui-caption">Contacto</div>
                  <div className="font-semibold">{summary.contactName}</div>
                  <div className="ui-caption mt-1">{summary.phone}</div>
                  <div className="ui-caption">{summary.email}</div>
                </div>

                <div className="rounded-lg bg-white p-3">
                  <div className="ui-caption">NIT</div>
                  <div className="font-semibold">{summary.taxId}</div>
                </div>

                <div className="rounded-lg bg-white p-3">
                  <div className="ui-caption">Dirección</div>
                  <div className="font-semibold">{summary.address}</div>
                </div>

                <div className="rounded-lg bg-white p-3">
                  <div className="ui-caption">Notas</div>
                  <div className="font-semibold whitespace-pre-wrap">{summary.notes}</div>
                </div>
              </div>

              {!canSubmit ? (
                <div className="ui-alert ui-alert--warn">
                  Completa al menos el nombre del proveedor para guardar.
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="submit" className="ui-btn ui-btn--brand" disabled={!canSubmit}>
          {mode === "edit" ? "Guardar cambios" : "Crear proveedor"}
        </button>
        <Link href={cancelHref} className="ui-btn ui-btn--ghost">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
