"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type SupplierOption = { id: string; name: string };
type SiteOption = { id: string; name?: string | null };
type ProductPresentationOption = {
  id: string;
  product_id: string;
  label: string;
  input_unit_code: string;
  qty_in_stock_unit: number;
  is_default: boolean;
};

type ProductOption = {
  id: string;
  name: string;
  sku?: string | null;
  unit?: string | null;
  stock_unit_code?: string | null;
  cost?: number | null;
  supplier_ids?: string[] | null;
  presentations?: ProductPresentationOption[] | null;
};

type LineItemValue = {
  product_id?: string;
  quantity?: number | null;
  unit_cost?: number | null;
  unit?: string | null;
  presentation_id?: string | null;
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
type LineRow = {
  product_id: string;
  presentation_id: string;
  quantity: string;
  unit_cost: string;
  unit: string;
};

const STEPS: Step[] = [
  { id: "cabecera", title: "Cabecera", objective: "Define proveedor, sede y fecha esperada." },
  { id: "lineas", title: "Lineas", objective: "Agrega productos, cantidades y costo unitario." },
  { id: "resumen", title: "Resumen", objective: "Valida datos y confirma guardado." },
];
const ALL_SUPPLIERS_VALUE = "__all__";

function toStr(v: unknown): string {
  return String(v ?? "").trim();
}

function toNum(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function makeEmptyLine(): LineRow {
  return {
    product_id: "",
    presentation_id: "",
    quantity: "",
    unit_cost: "",
    unit: "",
  };
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

function getStockUnitCode(product: ProductOption | undefined): string {
  return String(product?.stock_unit_code ?? product?.unit ?? "un").trim() || "un";
}

function getDefaultPresentation(product: ProductOption | undefined): ProductPresentationOption | null {
  const presentations = product?.presentations ?? [];
  return presentations.find((presentation) => presentation.is_default) ?? presentations[0] ?? null;
}

function getPresentationById(
  product: ProductOption | undefined,
  presentationId: string
): ProductPresentationOption | null {
  const presentations = product?.presentations ?? [];
  return presentations.find((presentation) => presentation.id === presentationId) ?? null;
}

function formatPresentationLabel(
  presentation: ProductPresentationOption,
  stockUnitCode: string
): string {
  return `${presentation.label} · 1 = ${formatQty(Number(presentation.qty_in_stock_unit ?? 0))} ${stockUnitCode}`;
}

function getSuggestedUnitCost(
  product: ProductOption | undefined,
  presentation: ProductPresentationOption | null
): number {
  const baseCost = Number(product?.cost ?? 0);
  const factor = Number(presentation?.qty_in_stock_unit ?? 0);

  if (!Number.isFinite(baseCost) || baseCost <= 0) return 0;
  if (!Number.isFinite(factor) || factor <= 0) return baseCost;

  return baseCost * factor;
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
  const [supplierId, setSupplierId] = useState(
    toStr(defaultValues?.supplier_id) || ALL_SUPPLIERS_VALUE
  );
  const [siteId, setSiteId] = useState(toStr(defaultValues?.site_id));
  const [expectedAt, setExpectedAt] = useState(toStr(defaultValues?.expected_at));
  const [notes, setNotes] = useState(toStr(defaultValues?.notes));
  const [productSearch, setProductSearch] = useState("");
  const [lineRows, setLineRows] = useState<LineRow[]>(() => {
    const incoming = defaultValues?.lines ?? [];
    if (!incoming.length) return [makeEmptyLine()];
    return incoming.map((line) => ({
      product_id: toStr(line.product_id),
      presentation_id: toStr(line.presentation_id),
      quantity: line.quantity == null ? "" : String(line.quantity),
      unit_cost: line.unit_cost == null ? "" : String(line.unit_cost),
      unit: toStr(line.unit),
    }));
  });

  const currentIndex = Math.max(0, STEPS.findIndex((s) => s.id === stepId));
  const progress = STEPS.length > 1 ? ((currentIndex + 1) / STEPS.length) * 100 : 100;
  const atFirstStep = currentIndex === 0;
  const atLastStep = currentIndex === STEPS.length - 1;

  const selectedSupplierId = supplierId === ALL_SUPPLIERS_VALUE ? "" : supplierId;
  const isHeaderComplete = Boolean(selectedSupplierId) && Boolean(siteId);
  const validLineCount = useMemo(
    () =>
      lineRows.filter((line) => {
        const q = toNum(line.quantity);
        return Boolean(line.product_id) && Boolean(line.presentation_id) && q != null && q > 0;
      }).length,
    [lineRows]
  );
  const canSubmit = isHeaderComplete && validLineCount > 0;
  const productById = useMemo(() => {
    return new Map(products.map((product) => [product.id, product]));
  }, [products]);
  const supplierFilteredProducts = useMemo(() => {
    if (!selectedSupplierId) return products;
    return products.filter((product) =>
      Array.isArray(product.supplier_ids) && product.supplier_ids.includes(selectedSupplierId)
    );
  }, [products, selectedSupplierId]);
  const visibleProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return supplierFilteredProducts;
    return supplierFilteredProducts.filter((product) => {
      const sku = String(product.sku ?? "").toLowerCase();
      const name = String(product.name ?? "").toLowerCase();
      return name.includes(query) || sku.includes(query);
    });
  }, [productSearch, supplierFilteredProducts]);

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
    const presentation = getDefaultPresentation(product);
    const costSuggestion = getSuggestedUnitCost(product, presentation);

    setLineRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        return {
          ...row,
          product_id: productId,
          presentation_id: presentation?.id ?? "",
          unit: presentation?.label ?? "",
          unit_cost: row.unit_cost || (costSuggestion > 0 ? String(costSuggestion) : row.unit_cost),
        };
      })
    );
  };

  const handlePresentationChange = (index: number, presentationId: string) => {
    setLineRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;

        const product = productById.get(row.product_id);
        const presentation = getPresentationById(product, presentationId);
        const costSuggestion = getSuggestedUnitCost(product, presentation);

        return {
          ...row,
          presentation_id: presentation?.id ?? "",
          unit: presentation?.label ?? "",
          unit_cost: row.unit_cost || (costSuggestion > 0 ? String(costSuggestion) : row.unit_cost),
        };
      })
    );
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="supplier_id" value={selectedSupplierId} />
      <input type="hidden" name="site_id" value={siteId} />
      <input type="hidden" name="expected_at" value={expectedAt} />
      <input type="hidden" name="notes" value={notes} />
      {lineRows.map((row, index) => (
        <div key={`line-hidden-${index}`}>
          <input type="hidden" name="item_product_id" value={row.product_id} />
          <input type="hidden" name="item_presentation_id" value={row.presentation_id} />
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
              <option value={ALL_SUPPLIERS_VALUE}>Todos los proveedores</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">
              Selecciona un proveedor para ver solo sus insumos en las lineas.
            </div>
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
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="ui-label">Buscar insumo</span>
            <input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Nombre o SKU"
              className="ui-input mt-1"
            />
          </label>
          <div className="ui-panel-soft p-3 text-sm text-[var(--ui-muted)]">
            {selectedSupplierId
              ? `${visibleProducts.length} insumo(s) disponibles para el proveedor seleccionado.`
              : `${visibleProducts.length} insumo(s) disponibles (todos los proveedores).`}
          </div>
        </div>
        <div className="space-y-3">
          {lineRows.map((line, i) => {
            const product = productById.get(line.product_id);
            const presentations = product?.presentations ?? [];
            const selectedPresentation = getPresentationById(product, line.presentation_id);
            const quantity = toNum(line.quantity) ?? 0;
            const unitCost = toNum(line.unit_cost) ?? 0;
            const stockUnitCode = getStockUnitCode(product);
            const conversionFactorToStock = Number(selectedPresentation?.qty_in_stock_unit ?? 0);
            const baseQuantity =
              quantity > 0 && conversionFactorToStock > 0
                ? quantity * conversionFactorToStock
                : 0;
            const baseUnitCost =
              unitCost > 0 && conversionFactorToStock > 0
                ? unitCost / conversionFactorToStock
                : 0;
            const presentationLabel = selectedPresentation?.label ?? "";
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
                    {visibleProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku ? `${p.sku} - ` : ""}{p.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">
                    {line.product_id
                      ? selectedPresentation
                        ? `Presentación: ${selectedPresentation.label} | Base: ${stockUnitCode}`
                        : "Este producto necesita una presentación física aprobada."
                      : "Selecciona un insumo para cargar sus presentaciones aprobadas."}
                  </div>
                </label>
                <label>
                  <span className="ui-label">Presentación</span>
                  <select
                    value={line.presentation_id}
                    onChange={(e) => handlePresentationChange(i, e.target.value)}
                    className="ui-input mt-1"
                    disabled={!line.product_id || presentations.length === 0}
                    required
                  >
                    <option value="">
                      {line.product_id ? "Seleccionar..." : "Primero selecciona producto"}
                    </option>
                    {presentations.map((presentation) => (
                      <option key={presentation.id} value={presentation.id}>
                        {formatPresentationLabel(presentation, stockUnitCode)}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">
                    {line.product_id && presentations.length === 0
                      ? "No hay presentaciones físicas activas para este producto."
                      : "Usa solo presentaciones aprobadas del catálogo."}
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
                    {quantity > 0 && selectedPresentation
                      ? `Equivale a ${formatQty(baseQuantity)} ${stockUnitCode} en unidad base.`
                      : "Cantidad de presentaciones recibidas/compradas."}
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
                    {unitCost > 0 && selectedPresentation
                      ? `${formatAmount(baseUnitCost)} por ${stockUnitCode} base.`
                      : "Costo por presentación seleccionada."}
                  </div>
                </label>
                <div className="sm:col-span-5 rounded-lg border border-[var(--ui-border)] bg-white/70 px-3 py-2 text-xs text-[var(--ui-muted)]">
                  <strong className="text-[var(--ui-text)]">Detalle:</strong>{" "}
                  {line.product_id && selectedPresentation
                    ? `Compra ${formatQty(quantity)} ${presentationLabel} | Base ${formatQty(
                      baseQuantity
                    )} ${stockUnitCode} | Costo base ${formatAmount(
                      baseUnitCost
                    )}/${stockUnitCode} | Total linea ${formatAmount(lineTotal)}`
                    : line.product_id
                      ? "Selecciona una presentación física aprobada para calcular equivalencias."
                      : "Completa producto, presentación, cantidad y costo para ver equivalencias."}
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
            Completa proveedor, sede y al menos una línea con producto, presentación y cantidad.
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
