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

type LineRow = {
  product_id: string;
  presentation_id: string;
  quantity: string;
  unit_cost: string;
  unit: string;
  product_search: string;
};

function toStr(v: unknown): string {
  return String(v ?? "").trim();
}

function toNum(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function makeEmptyLine(): LineRow {
  return {
    product_id: "",
    presentation_id: "",
    quantity: "",
    unit_cost: "",
    unit: "",
    product_search: "",
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
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(Number.isFinite(value) ? value : 0);
}

function getStockUnitCode(product: ProductOption | undefined): string {
  return String(product?.stock_unit_code ?? product?.unit ?? "un").trim().toLowerCase() || "un";
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

function getInternalEstimatedLineTotal(product: ProductOption | undefined, stockQuantity: number): number {
  const stockUnitCost = Number(product?.cost ?? 0);

  if (!Number.isFinite(stockUnitCost) || stockUnitCost <= 0) return 0;
  if (!Number.isFinite(stockQuantity) || stockQuantity <= 0) return 0;

  return Math.round(stockUnitCost * stockQuantity * 100) / 100;
}

function productLabel(product: ProductOption | undefined) {
  if (!product) return "Producto";
  return `${product.sku ? `${product.sku} · ` : ""}${product.name}`;
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
  const [supplierId, setSupplierId] = useState(toStr(defaultValues?.supplier_id));
  const [siteId, setSiteId] = useState(toStr(defaultValues?.site_id));
  const [expectedAt, setExpectedAt] = useState(toStr(defaultValues?.expected_at));
  const [notes, setNotes] = useState(toStr(defaultValues?.notes));
  const [activeProductPickerIndex, setActiveProductPickerIndex] = useState<number | null>(null);
  const [lineRows, setLineRows] = useState<LineRow[]>(() => {
    const incoming = defaultValues?.lines ?? [];
    if (!incoming.length) return [makeEmptyLine()];

    return incoming.map((line) => ({
      product_id: toStr(line.product_id),
      presentation_id: toStr(line.presentation_id),
      quantity: line.quantity == null ? "" : String(line.quantity),
      unit_cost: line.unit_cost == null ? "" : String(line.unit_cost),
      unit: toStr(line.unit),
      product_search: "",
    }));
  });

  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) ?? null;
  const selectedSite = sites.find((site) => site.id === siteId) ?? null;

  const productById = useMemo(() => {
    return new Map(products.map((product) => [product.id, product]));
  }, [products]);

  const supplierFilteredProducts = useMemo(() => {
    if (!supplierId) return [];

    return products.filter((product) =>
      Array.isArray(product.supplier_ids) && product.supplier_ids.includes(supplierId)
    );
  }, [products, supplierId]);

  const visibleProductsByLine = useMemo(() => {
    return lineRows.map((line) => {
      const query = normalizeSearch(line.product_search);
      const base = supplierFilteredProducts;

      if (!query) return base.slice(0, 12);

      return base
        .filter((product) => {
          const haystack = normalizeSearch(`${product.sku ?? ""} ${product.name ?? ""} ${product.unit ?? ""}`);
          return haystack.includes(query);
        })
        .slice(0, 12);
    });
  }, [lineRows, supplierFilteredProducts]);

  const lineSummaries = useMemo(() => {
    return lineRows.map((line) => {
      const product = productById.get(line.product_id);
      const presentations = product?.presentations ?? [];
      const presentation = getPresentationById(product, line.presentation_id);
      const quantity = toNum(line.quantity) ?? 0;
      const conversionFactor = presentation ? Number(presentation.qty_in_stock_unit ?? 0) : 1;
      const safeConversionFactor = Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1;
      const stockUnitCode = getStockUnitCode(product);
      const stockQuantity = quantity > 0 ? quantity * safeConversionFactor : 0;
      const stockUnitCost = Number(product?.cost ?? 0);
      const total = getInternalEstimatedLineTotal(product, stockQuantity);
      const isValid = Boolean(product) && Boolean(presentation) && quantity > 0;

      return {
        product,
        presentation,
        quantity,
        conversionFactor: safeConversionFactor,
        stockUnitCode,
        stockQuantity,
        stockUnitCost,
        total,
        isValid,
      };
    });
  }, [lineRows, productById]);

  const validLineCount = lineSummaries.filter((line) => line.isValid).length;
  const summaryTotal = lineSummaries.reduce((acc, line) => acc + line.total, 0);
  const summaryStockQty = lineSummaries.reduce((acc, line) => acc + line.stockQuantity, 0);
  const canSubmit = Boolean(supplierId) && Boolean(siteId) && validLineCount > 0;

  const addLine = () => setLineRows((current) => [...current, makeEmptyLine()]);

  const removeLine = (index: number) => {
    setLineRows((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
    setActiveProductPickerIndex((current) => (current === index ? null : current));
  };

  const updateLine = (index: number, patch: Partial<LineRow>) => {
    setLineRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const selectProduct = (index: number, product: ProductOption) => {
    updateLine(index, {
      product_id: product.id,
      product_search: productLabel(product),
      presentation_id: "",
      unit: getStockUnitCode(product),
      unit_cost: "",
    });
    setActiveProductPickerIndex(null);
  };

  const handlePresentationChange = (index: number, presentationId: string) => {
    const current = lineRows[index];
    const product = productById.get(current.product_id);
    const presentation = getPresentationById(product, presentationId);

    updateLine(index, {
      presentation_id: presentation?.id ?? "",
      unit: presentation?.label ?? getStockUnitCode(product),
      unit_cost: "",
    });
  };

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <input type="hidden" name="supplier_id" value={supplierId} />
      <input type="hidden" name="site_id" value={siteId} />
      <input type="hidden" name="expected_at" value={expectedAt} />
      <input type="hidden" name="notes" value={notes} />

      {lineRows.map((row, index) => {
        const product = productById.get(row.product_id);
        const presentation = getPresentationById(product, row.presentation_id);
        const unitValue = row.unit || presentation?.label || (row.product_id ? getStockUnitCode(product) : "");

        return (
          <div key={`line-hidden-${index}`} className="hidden">
            <input type="hidden" name="item_product_id" value={row.product_id} />
            <input type="hidden" name="item_presentation_id" value={row.presentation_id} />
            <input type="hidden" name="item_quantity" value={row.quantity} />
            <input type="hidden" name="item_unit_cost" value="" />
            <input type="hidden" name="item_unit" value={unitValue} />
          </div>
        );
      })}

      <div className="space-y-5">
        <section className="rounded-[1.75rem] border border-[var(--ui-border)] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="ui-caption">Orden de compra</div>
              <h2 className="mt-1 text-xl font-bold text-[var(--ui-text)]">
                {mode === "edit" ? "Editar orden de compra" : "Nueva orden de compra"}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--ui-muted)]">
                Crea la OC como solicitud operativa: proveedor, sede, líneas de compra,
                presentación física y cantidades. Los costos no se envían al proveedor.
              </p>
            </div>

            <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
              Builder
            </span>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-4">
            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className="ui-label">Proveedor *</span>
              <select
                value={supplierId}
                onChange={(event) => {
                  setSupplierId(event.target.value);
                  setActiveProductPickerIndex(null);
                  setLineRows((current) =>
                    current.map((row) => ({
                      ...row,
                      product_id: "",
                      presentation_id: "",
                      unit: "",
                      unit_cost: "",
                      product_search: "",
                    }))
                  );
                }}
                className="ui-input"
                required
              >
                <option value="">Seleccionar proveedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[var(--ui-muted)]">
                Al seleccionar proveedor, ORIGO muestra solo los insumos asociados a ese proveedor.
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Sede destino *</span>
              <select
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
                className="ui-input"
                required
              >
                <option value="">Seleccionar sede</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name ?? site.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Fecha esperada</span>
              <input
                type="date"
                value={expectedAt}
                onChange={(event) => setExpectedAt(event.target.value)}
                className="ui-input"
              />
            </label>
          </div>

          <label className="mt-4 flex flex-col gap-1">
            <span className="ui-label">Notas</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 text-[var(--ui-text)] placeholder:text-[var(--ui-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
              placeholder="Condiciones, referencia, observaciones para recepción..."
            />
          </label>

          {supplierId && supplierFilteredProducts.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <div className="font-semibold">Proveedor sin productos asociados</div>
              <p className="mt-1">
                Este proveedor no tiene insumos vinculados en product_suppliers para esta orden.
                Vincula primero los productos del proveedor en el catálogo antes de crear la OC.
              </p>
            </div>
          ) : null}
        </section>

        <section className="rounded-[1.75rem] border border-[var(--ui-border)] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[var(--ui-text)]">Líneas de compra</h3>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                Selecciona insumos del proveedor, presentación de compra y cantidad solicitada.
              </p>
            </div>

            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={addLine}>
              + Agregar línea
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {lineRows.map((line, index) => {
              const summary = lineSummaries[index];
              const product = summary.product;
              const presentations = product?.presentations ?? [];
              const visibleProducts = visibleProductsByLine[index] ?? [];
              const selectedPresentation = summary.presentation;

              return (
                <div
                  key={`line-${index}`}
                  className="rounded-[1.5rem] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-[var(--ui-text)]">Línea {index + 1}</div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        {product ? productLabel(product) : "Selecciona un insumo."}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                      onClick={() => removeLine(index)}
                      disabled={lineRows.length <= 1}
                    >
                      Quitar
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(280px,1.2fr)_minmax(320px,1fr)]">
                    <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                      <div className="text-sm font-bold text-[var(--ui-text)]">Insumo</div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        {selectedSupplier
                          ? `Proveedor: ${selectedSupplier.name}`
                          : "Selecciona proveedor para priorizar insumos."}
                      </div>

                      <div className="mt-3">
                        <input
                          className="ui-input"
                          placeholder="Buscar insumo por nombre o SKU"
                          value={line.product_search || (product ? productLabel(product) : "")}
                          onFocus={() => setActiveProductPickerIndex(index)}
                          onChange={(event) => {
                            updateLine(index, {
                              product_search: event.target.value,
                              product_id: "",
                              presentation_id: "",
                              unit: "",
                            });
                            setActiveProductPickerIndex(index);
                          }}
                        />

                        {activeProductPickerIndex === index ? (
                          <div className="mt-2 max-h-80 overflow-y-auto rounded-2xl border border-[var(--ui-border)] bg-white p-2 shadow-lg">
                            {visibleProducts.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                className="mb-2 w-full rounded-2xl border border-[var(--ui-border)] bg-white p-3 text-left transition hover:border-[var(--ui-brand)] hover:bg-[var(--ui-brand)]/5"
                                onClick={() => selectProduct(index, option)}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-bold text-[var(--ui-text)]">
                                      {productLabel(option)}
                                    </div>
                                    <div className="mt-1 text-xs text-[var(--ui-muted)]">
                                      Unidad stock: {getStockUnitCode(option)}
                                    </div>
                                    <div className="mt-1 text-xs text-[var(--ui-muted)]">
                                      Presentaciones: {(option.presentations ?? []).length || "sin presentación"}
                                    </div>
                                  </div>
                                  <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2 py-1 text-[11px] font-semibold text-[var(--ui-muted)]">
                                    Seleccionar
                                  </span>
                                </div>
                              </button>
                            ))}

                            {!visibleProducts.length ? (
                              <div className="rounded-2xl border border-dashed border-[var(--ui-border)] p-4 text-sm text-[var(--ui-muted)]">
                                {!supplierId
                                  ? "Selecciona primero un proveedor para cargar sus insumos."
                                  : "Este proveedor no tiene insumos asociados o no hay coincidencias con la búsqueda."}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                      <div className="text-sm font-bold text-[var(--ui-text)]">Presentación y cantidad</div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        La OC guarda presentación física aprobada y equivalencia a stock.
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <span className="ui-label">Presentación</span>
                          {line.product_id && presentations.length === 0 ? (
                            <div className="mt-1 rounded-[var(--ui-radius-control)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
                              Sin presentación manual configurada. Crea una presentación activa para este producto
                              antes de agregarlo a una OC.
                            </div>
                          ) : (
                            <select
                              value={line.presentation_id}
                              onChange={(event) => handlePresentationChange(index, event.target.value)}
                              className="ui-input mt-1"
                              disabled={!line.product_id}
                              required
                            >
                              <option value="">
                                {line.product_id ? "Seleccionar presentación manual" : "Primero selecciona producto"}
                              </option>
                              {presentations.map((presentation) => (
                                <option key={presentation.id} value={presentation.id}>
                                  {formatPresentationLabel(presentation, summary.stockUnitCode)}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <label>
                          <span className="ui-label">Cantidad solicitada</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.quantity}
                            onChange={(event) => updateLine(index, { quantity: event.target.value })}
                            className="ui-input mt-1"
                          />
                        </label>
                      </div>

                      <div className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-xs text-[var(--ui-muted)]">
                        {line.product_id && selectedPresentation ? (
                          <>
                            <div className="font-semibold text-[var(--ui-text)]">
                              {selectedPresentation.label}
                            </div>
                            <div className="mt-1">
                              {formatQty(summary.quantity)} presentación(es) ={" "}
                              {formatQty(summary.stockQuantity)} {summary.stockUnitCode}
                            </div>
                          </>
                        ) : line.product_id && presentations.length === 0 ? (
                          <>
                            <div className="font-semibold text-amber-900">
                              Falta presentación manual
                            </div>
                            <div className="mt-1">
                              La OC exige una presentación manual para guardar la equivalencia a stock.
                            </div>
                          </>
                        ) : line.product_id ? (
                          "Selecciona una presentación física aprobada para calcular equivalencias."
                        ) : (
                          "Completa producto, presentación y cantidad para ver equivalencias."
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="xl:sticky xl:top-4 xl:self-start">
        <div className="rounded-[1.75rem] border border-[var(--ui-border)] bg-white p-5 shadow-sm">
          <div className="text-lg font-bold text-[var(--ui-text)]">Resumen interno de OC</div>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Revisa proveedor, sede y líneas antes de guardar. El estimado interno no se envía al proveedor.
          </p>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Proveedor</div>
              <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                {selectedSupplier?.name ?? "Sin seleccionar"}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Sede destino</div>
              <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                {selectedSite?.name ?? selectedSite?.id ?? "Sin seleccionar"}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Líneas</div>
                <div className="mt-1 text-2xl font-bold text-[var(--ui-text)]">{validLineCount}</div>
              </div>

              <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Stock</div>
                <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">{formatQty(summaryStockQty)}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Estimado interno</div>
              <div className="mt-1 text-2xl font-bold text-[var(--ui-text)]">
                {formatAmount(summaryTotal)}
              </div>
              <div className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
                Referencia contable local. El costo real se define al recibir la factura/remisión del proveedor.
              </div>
            </div>

            {!canSubmit ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                Completa proveedor, sede y al menos una línea con producto, presentación manual y cantidad.
              </div>
            ) : null}

            <button type="submit" className="ui-btn ui-btn--brand w-full" disabled={!canSubmit}>
              {mode === "edit" ? "Guardar cambios" : "Crear orden en borrador"}
            </button>

            <Link href={cancelHref} className="ui-btn ui-btn--ghost w-full">
              Cancelar
            </Link>
          </div>
        </div>
      </aside>
    </form>
  );
}
