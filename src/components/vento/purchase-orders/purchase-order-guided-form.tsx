"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { normalizeQuantityToBase, normalizeUnitCostToBase } from "@/lib/units/normalize";

type SupplierOption = { id: string; name: string };
type SiteOption = { id: string; name?: string | null };
type ProductOption = {
  id: string;
  name: string;
  sku?: string | null;
  unit?: string | null;
  stock_unit_code?: string | null;
  cost?: number | null;
};
type LineItemValue = {
  product_id?: string;
  quantity?: number | null;
  unit_cost?: number | null;
  unit?: string | null;
};

type PurchaseOrderGuidedFormProps = {
  mode: "create" | "edit";
  action: (formData: FormData) => void | Promise<void>;
  cancelHref: string;
  suppliers: SupplierOption[];
  sites: SiteOption[];
  products: ProductOption[];
  defaultValues?: {
    supplier_id?: string;
    site_id?: string;
    expected_at?: string;
    notes?: string | null;
    lines?: LineItemValue[];
  };
};

type Step = { id: string; title: string; objective: string };
type LineRow = { product_id: string; quantity: string; unit_cost: string; unit: string };

const STEPS: Step[] = [
  { id: "cabecera", title: "Cabecera", objective: "Define proveedor, sede y fecha esperada." },
  { id: "lineas", title: "Lineas", objective: "Agrega productos, cantidades y costo unitario." },
  { id: "resumen", title: "Resumen", objective: "Valida datos y confirma guardado." },
];

function toStr(v: unknown): string {
  return String(v ?? "").trim();
}

function toNum(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function makeEmptyLine(): LineRow {
  return { product_id: "", quantity: "", unit_cost: "", unit: "" };
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatQty(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(safe);
}

export function PurchaseOrderGuidedForm({
  mode,
  action,
  cancelHref,
  suppliers,
  sites,
  products,
  defaultValues,
}: PurchaseOrderGuidedFormProps) {
  const [stepId, setStepId] = useState(STEPS[0].id);
  const [supplierId, setSupplierId] = useState(toStr(defaultValues?.supplier_id));
  const [siteId, setSiteId] = useState(toStr(defaultValues?.site_id));
  const [expectedAt, setExpectedAt] = useState(toStr(defaultValues?.expected_at));
  const [notes, setNotes] = useState(toStr(defaultValues?.notes));
  const [lineRows, setLineRows] = useState<LineRow[]>(() => {
    const incoming = defaultValues?.lines ?? [];
    if (!incoming.length) return [makeEmptyLine()];
    return incoming.map((line) => ({
      product_id: toStr(line.product_id),
      quantity: line.quantity == null ? "" : String(line.quantity),
      unit_cost: line.unit_cost == null ? "" : String(line.unit_cost),
      unit: toStr(line.unit),
    }));
  });

  const currentIndex = Math.max(0, STEPS.findIndex((s) => s.id === stepId));
  const progress = STEPS.length > 1 ? ((currentIndex + 1) / STEPS.length) * 100 : 100;
  const atFirstStep = currentIndex === 0;
  const atLastStep = currentIndex === STEPS.length - 1;

  const isHeaderComplete = Boolean(supplierId) && Boolean(siteId);
  const validLineCount = useMemo(
    () =>
      lineRows.filter((line) => {
        const q = toNum(line.quantity);
        return Boolean(line.product_id) && q != null && q > 0;
      }).length,
    [lineRows]
  );
  const canSubmit = isHeaderComplete;
  const productById = useMemo(() => {
    return new Map(products.map((product) => [product.id, product]));
  }, [products]);

  const summaryTotal = useMemo(
    () =>
      lineRows.reduce((acc, line) => {
        const q = toNum(line.quantity);
        const c = toNum(line.unit_cost) ?? 0;
        if (!line.product_id || q == null || q <= 0) return acc;
        return acc + q * c;
      }, 0),
    [lineRows]
  );

  const moveStep = (delta: -1 | 1) => {
    const next = Math.min(STEPS.length - 1, Math.max(0, currentIndex + delta));
    setStepId(STEPS[next].id);
  };

  const addLine = () => setLineRows((current) => [...current, makeEmptyLine()]);
  const removeLine = (index: number) =>
    setLineRows((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
  const updateLine = (index: number, field: keyof LineRow, value: string) => {
    setLineRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const handleProductChange = (index: number, productId: string) => {
    const product = productById.get(productId);
    const unitSuggestion = String(product?.stock_unit_code ?? product?.unit ?? "").trim();
    const costSuggestion = Number(product?.cost ?? 0);

    setLineRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        return {
          ...row,
          product_id: productId,
          unit: unitSuggestion || row.unit,
          unit_cost: row.unit_cost || (costSuggestion > 0 ? String(costSuggestion) : row.unit_cost),
        };
      })
    );
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="supplier_id" value={supplierId} />
      <input type="hidden" name="site_id" value={siteId} />
      <input type="hidden" name="expected_at" value={expectedAt} />
      <input type="hidden" name="notes" value={notes} />
      {lineRows.map((row, index) => (
        <div key={`line-hidden-${index}`}>
          <input type="hidden" name="item_product_id" value={row.product_id} />
          <input type="hidden" name="item_quantity" value={row.quantity} />
          <input type="hidden" name="item_unit_cost" value={row.unit_cost} />
          <input type="hidden" name="item_unit" value={row.unit} />
        </div>
      ))}

      <section className="ui-panel-soft space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="ui-caption">Paso {currentIndex + 1} de {STEPS.length}</div>
          <div className="ui-caption">{Math.round(progress)}%</div>
        </div>
        <div className="h-2 rounded-full bg-zinc-200">
          <div className="h-2 rounded-full bg-[var(--ui-brand)] transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {STEPS.map((step, index) => {
            const status =
              index === currentIndex ? "current" : index < currentIndex ? "complete" : "pending";
            const cls =
              status === "current"
                ? "border-[var(--ui-brand)] bg-[var(--ui-brand)]/10 text-[var(--ui-brand-700)]"
                : status === "complete"
                  ? "border-[var(--ui-success)] bg-[var(--ui-success)]/10 text-[var(--ui-success)]"
                  : "border-[var(--ui-border)] bg-white text-[var(--ui-muted)]";
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setStepId(step.id)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors hover:border-[var(--ui-brand)] ${cls}`}
              >
                <div className="text-xs font-semibold uppercase tracking-wide">Paso {index + 1}</div>
                <div className="text-sm font-semibold">{step.title}</div>
              </button>
            );
          })}
        </div>
        <div className="rounded-lg border border-[var(--ui-border)] bg-white p-3">
          <div className="text-sm font-semibold">{STEPS[currentIndex].title}</div>
          <div className="ui-caption mt-1">{STEPS[currentIndex].objective}</div>
        </div>
      </section>

      <section className={stepId === "cabecera" ? "ui-panel space-y-4" : "hidden"}>
        <div className="ui-h3">Paso 1. Cabecera</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="ui-label">Proveedor *</span>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="ui-input mt-1" required>
              <option value="">Seleccionar...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="ui-label">Sede *</span>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="ui-input mt-1" required>
              <option value="">Seleccionar...</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name ?? s.id}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="ui-label">Fecha esperada</span>
            <input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} className="ui-input mt-1" />
          </label>
          <label className="sm:col-span-2">
            <span className="ui-label">Notas</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 text-[var(--ui-text)] placeholder:text-[var(--ui-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
              placeholder="Referencia, observaciones..."
            />
          </label>
        </div>
      </section>

      <section className={stepId === "lineas" ? "ui-panel space-y-4" : "hidden"}>
        <div className="flex items-center justify-between gap-2">
          <div className="ui-h3">Paso 2. Lineas</div>
          <div className="flex items-center gap-2">
            <div className="ui-caption">{validLineCount} linea(s) validas</div>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={addLine}>
              + Agregar linea
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {lineRows.map((line, i) => {
            const product = productById.get(line.product_id);
            const quantity = toNum(line.quantity) ?? 0;
            const unitCost = toNum(line.unit_cost) ?? 0;
            const unitCode = line.unit || product?.stock_unit_code || product?.unit || "";
            const normalizedQty = normalizeQuantityToBase({ quantity, unit: unitCode });
            const normalizedCost = normalizeUnitCostToBase({ unitCost, unit: unitCode });
            const lineTotal = quantity > 0 ? quantity * unitCost : 0;

            return (
            <div key={`line-${i}`} className="ui-panel-soft grid gap-3 sm:grid-cols-5">
              <label className="sm:col-span-2">
                <span className="ui-label">Producto</span>
                <select
                  value={line.product_id}
                  onChange={(e) => handleProductChange(i, e.target.value)}
                  className="ui-input mt-1"
                >
                  <option value="">Seleccionar...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku ? `${p.sku} - ` : ""}{p.name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  {line.product_id
                    ? `Unidad operativa: ${unitCode || "u"} | Base: ${normalizedQty.baseUnit}`
                    : "Selecciona un insumo para cargar su unidad operativa."}
                </div>
              </label>
              <label>
                <span className="ui-label">Cantidad</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={line.quantity}
                  onChange={(e) => updateLine(i, "quantity", e.target.value)}
                  className="ui-input mt-1"
                />
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  {quantity > 0
                    ? `Equivale a ${formatQty(normalizedQty.baseQuantity)} ${normalizedQty.baseUnit} en unidad base.`
                    : "Cantidad en unidad operativa de compra del insumo."}
                </div>
              </label>
              <label>
                <span className="ui-label">Costo unit.</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unit_cost}
                  onChange={(e) => updateLine(i, "unit_cost", e.target.value)}
                  className="ui-input mt-1"
                />
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  {unitCost > 0
                    ? `${formatAmount(normalizedCost.baseUnitCost)} por ${normalizedCost.baseUnit} (normalizado).`
                    : "Costo por unidad operativa."}
                </div>
              </label>
              <label>
                <span className="ui-label">Unidad</span>
                <input
                  value={line.unit}
                  onChange={(e) => updateLine(i, "unit", e.target.value)}
                  className="ui-input mt-1"
                  placeholder="u"
                />
              </label>
              <div className="sm:col-span-5 rounded-lg border border-[var(--ui-border)] bg-white/70 px-3 py-2 text-xs text-[var(--ui-muted)]">
                <strong className="text-[var(--ui-text)]">Detalle:</strong>{" "}
                {line.product_id
                  ? `Cantidad operativa ${formatQty(quantity)} ${unitCode || "u"} | Cantidad base ${formatQty(
                      normalizedQty.baseQuantity
                    )} ${normalizedQty.baseUnit} | Costo base ${formatAmount(
                      normalizedCost.baseUnitCost
                    )}/${normalizedQty.baseUnit} | Total linea ${formatAmount(lineTotal)}`
                  : "Completa producto, cantidad y costo para ver equivalencias y costos normalizados."}
              </div>
              <div className="sm:col-span-5 flex justify-end">
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => removeLine(i)}>
                  Quitar linea
                </button>
              </div>
            </div>
          );
          })}
        </div>
      </section>

      <section className={stepId === "resumen" ? "ui-panel space-y-4" : "hidden"}>
        <div className="ui-h3">Paso 3. Resumen y validacion</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Proveedor</div>
            <div className="font-semibold">{suppliers.find((s) => s.id === supplierId)?.name ?? "Sin definir"}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Sede</div>
            <div className="font-semibold">{sites.find((s) => s.id === siteId)?.name ?? "Sin definir"}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Lineas validas</div>
            <div className="font-semibold">{validLineCount}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Total estimado</div>
            <div className="font-semibold">{summaryTotal.toLocaleString("es-CO", { maximumFractionDigits: 2 })}</div>
          </div>
        </div>
        {!canSubmit ? (
          <div className="ui-alert ui-alert--warn">
            Completa proveedor y sede para poder guardar.
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {!atFirstStep ? (
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => moveStep(-1)}>
              Anterior
            </button>
          ) : null}
          {!atLastStep ? (
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => moveStep(1)}>
              Siguiente
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" className="ui-btn ui-btn--brand" disabled={!canSubmit}>
            {mode === "edit" ? "Guardar cambios" : "Crear orden (borrador)"}
          </button>
          <Link href={cancelHref} className="ui-btn ui-btn--ghost">
            Cancelar
          </Link>
        </div>
      </div>
    </form>
  );
}
