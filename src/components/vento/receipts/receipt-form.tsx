"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatPurchaseOrderRef } from "@/lib/purchase-orders/reference";

type SupplierRow = {
  id: string;
  name: string | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  cost: number | null;
  lot_tracking: boolean;
  expiry_tracking: boolean;
};

type LocationRow = {
  id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

type LocationPositionRow = {
  id: string;
  location_id: string;
  parent_position_id: string | null;
  code: string;
  name: string;
  kind: string;
  sort_order: number | null;
};

type PurchaseOrderOption = {
  id: string;
  created_at: string | null;
  status: string | null;
  suppliers?: { name?: string | null } | null;
};

type PrefillRow = {
  productId: string;
  quantity: number;
  unitCost: number;
  purchaseOrderItemId: string;
  presentationId: string;
  inputUnitCode: string;
  inputUnitLabel: string;
  conversionFactorToStock: number;
  stockUnitCode: string;
};

type ReceiptLine = {
  productId: string;
  productSearch: string;
  locationId: string;
  positionId: string;
  quantity: string;
  unitCost: string;
  lotNumber: string;
  expiryDate: string;
  notes: string;
  purchaseOrderItemId: string;
  presentationId: string;
  inputUnitCode: string;
  inputUnitLabel: string;
  conversionFactorToStock: string;
  stockUnitCode: string;
};

type StoredReceiptDraft = {
  supplierId?: string;
  invoiceNumber?: string;
  notes?: string;
  receivedAt?: string;
  emergencyReason?: string;
  lines?: ReceiptLine[];
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  siteId: string;
  suppliers: SupplierRow[];
  products: ProductRow[];
  locations: LocationRow[];
  locationPositions?: LocationPositionRow[];
  purchaseOrders: PurchaseOrderOption[];
  selectedPurchaseOrderId: string;
  prefillSupplierId: string;
  prefillInvoiceNumber: string;
  prefillNotes: string;
  prefillRows: PrefillRow[];
  serverErrorMessage?: string;
  submitSuccess?: boolean;
};

function buildInitialRows(params: {
  prefillRows: PrefillRow[];
  defaultLocationId: string;
}): ReceiptLine[] {
  if (!params.prefillRows.length) {
    return [
      {
        productId: "",
        productSearch: "",
        locationId: params.defaultLocationId,
        positionId: "",
        quantity: "",
        unitCost: "",
        lotNumber: "",
        expiryDate: "",
        notes: "",
        purchaseOrderItemId: "",
        presentationId: "",
        inputUnitCode: "",
        inputUnitLabel: "",
        conversionFactorToStock: "1",
        stockUnitCode: "",
      },
    ];
  }

  return params.prefillRows.map((row) => ({
    productId: row.productId,
    productSearch: "",
    locationId: params.defaultLocationId,
    positionId: "",
    quantity: String(row.quantity),
    unitCost: row.unitCost > 0 ? String(row.unitCost) : "",
    lotNumber: "",
    expiryDate: "",
    notes: "",
    purchaseOrderItemId: row.purchaseOrderItemId,
    presentationId: row.presentationId,
    inputUnitCode: row.inputUnitCode,
    inputUnitLabel: row.inputUnitLabel,
    conversionFactorToStock: String(row.conversionFactorToStock || 1),
    stockUnitCode: row.stockUnitCode,
  }));
}

function normalizeStoredLines(lines: ReceiptLine[] | undefined, defaultLocationId: string) {
  if (!Array.isArray(lines) || !lines.length) return null;
  return lines.map((line) => ({
    productId: line.productId ?? "",
    productSearch: line.productSearch ?? "",
    locationId: line.locationId ?? defaultLocationId,
    positionId: line.positionId ?? "",
    quantity: line.quantity ?? "",
    unitCost: line.unitCost ?? "",
    lotNumber: line.lotNumber ?? "",
    expiryDate: line.expiryDate ?? "",
    notes: line.notes ?? "",
    purchaseOrderItemId: line.purchaseOrderItemId ?? "",
    presentationId: line.presentationId ?? "",
    inputUnitCode: line.inputUnitCode ?? "",
    inputUnitLabel: line.inputUnitLabel ?? "",
    conversionFactorToStock: line.conversionFactorToStock ?? "1",
    stockUnitCode: line.stockUnitCode ?? "",
  }));
}

function readStoredDraft(storageKey: string, defaultLocationId: string): StoredReceiptDraft | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredReceiptDraft;
    return {
      ...parsed,
      lines: normalizeStoredLines(parsed.lines, defaultLocationId) ?? undefined,
    };
  } catch {
    return null;
  }
}
const RECEIPT_LOCATION_LABELS_BY_CODE: Record<string, string> = {
  "LOC-CP-BOD-MAIN": "Bodega principal",
  "LOC-CP-N3P-MAIN": "Nevera 3 puertas",
  "LOC-CP-FRIO-MAIN": "Cuarto de enfriamiento",
  "LOC-CP-CONG-MAIN": "Cuarto de congelación",
  "LOC-CP-PROD-COC-01": "Operación · Cocina caliente",
  "LOC-CP-PROD-PAN-01": "Operación · Galletería y panadería",
  "LOC-CP-PROD-REP-01": "Operación · Repostería",
};

function formatReceiptLocationLabel(location: LocationRow) {
  const code = String(location.code ?? "").trim();
  const description = String(location.description ?? "").trim();
  const zone = String(location.zone ?? "").trim();
  const friendlyLabel = code ? RECEIPT_LOCATION_LABELS_BY_CODE[code] : "";

  if (friendlyLabel) return friendlyLabel;
  if (description) return description;
  if (zone) return zone;
  if (code) return code;

  return location.id;
}
function formatLocationPositionLabel(position: LocationPositionRow) {
  const name = String(position.name || position.code || position.id).trim();
  const kind = String(position.kind || "").trim();

  if (!kind) return name;

  return `${name} · ${kind}`;
}

function formatProductOptionLabel(product: ProductRow) {
  const name = String(product.name ?? product.id).trim();
  const unit = String(product.stock_unit_code ?? product.unit ?? "").trim();

  return unit ? `${name} · ${unit}` : name;
}

function normalizeProductSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatQty(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function getProductStockUnitCode(product: ProductRow | undefined): string {
  return String(product?.stock_unit_code ?? product?.unit ?? "un").trim().toLowerCase() || "un";
}

export function ReceiptForm({
  action,
  siteId,
  suppliers,
  products,
  locations,
  locationPositions = [],
  purchaseOrders,
  selectedPurchaseOrderId,
  prefillSupplierId,
  prefillInvoiceNumber,
  prefillNotes,
  prefillRows,
  serverErrorMessage = "",
  submitSuccess = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaultLocationId = locations[0]?.id ?? "";
  const receiptDraftScope = selectedPurchaseOrderId ? `po:${selectedPurchaseOrderId}` : "emergency";
  const storageKey = `origo:receipts:form:${siteId}:${receiptDraftScope}`;
  const legacyStorageKey = `origo:receipts:form:${siteId}`;
  const storedDraft = readStoredDraft(storageKey, defaultLocationId);

  const [supplierId, setSupplierId] = useState(storedDraft?.supplierId ?? prefillSupplierId);
  const [invoiceNumber, setInvoiceNumber] = useState(storedDraft?.invoiceNumber ?? prefillInvoiceNumber);
  const [notes, setNotes] = useState(storedDraft?.notes ?? prefillNotes);
  const [receivedAt, setReceivedAt] = useState(storedDraft?.receivedAt ?? "");
  const [emergencyReason, setEmergencyReason] = useState(storedDraft?.emergencyReason ?? "");
  const [lines, setLines] = useState<ReceiptLine[]>(() => {
    const initialRows = buildInitialRows({ prefillRows, defaultLocationId });
    const storedLinesAreUsable =
      Boolean(storedDraft?.lines?.length) &&
      (!selectedPurchaseOrderId ||
        storedDraft?.lines?.every(
          (line) =>
            Boolean(line.purchaseOrderItemId) &&
            Boolean(line.inputUnitLabel) &&
            Number(line.conversionFactorToStock || 0) > 0
        ));

    return storedLinesAreUsable ? storedDraft?.lines ?? initialRows : initialRows;
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const entryMode = selectedPurchaseOrderId ? "normal" : "emergency";
  const isPurchaseOrderReceipt = entryMode === "normal";

  const poOptions = useMemo(
    () =>
      purchaseOrders.map((po) => ({
        value: po.id,
        label: `${formatPurchaseOrderRef({ id: po.id, createdAt: po.created_at })} - ${po.suppliers?.name ?? "Proveedor"} - ${po.status ?? "-"}`,
      })),
    [purchaseOrders]
  );
  const hasPurchaseOrderOptions = poOptions.length > 0;

  const productMap = useMemo(() => {
    const map = new Map<string, ProductRow>();
    for (const product of products) map.set(product.id, product);
    return map;
  }, [products]);

  const productOptions = useMemo(
    () =>
      products.map((product) => {
        const label = formatProductOptionLabel(product);

        return {
          id: product.id,
          label,
          searchKey: normalizeProductSearch(label),
        };
      }),
    [products]
  );

  const productIdByLabel = useMemo(() => {
    const map = new Map<string, string>();

    for (const option of productOptions) {
      map.set(option.label, option.id);
    }

    return map;
  }, [productOptions]);

  const productLabelById = useMemo(() => {
    const map = new Map<string, string>();

    for (const option of productOptions) {
      map.set(option.id, option.label);
    }

    return map;
  }, [productOptions]);

  const getProductSuggestions = (search: string) => {
    const normalizedSearch = normalizeProductSearch(search);

    if (!normalizedSearch) return productOptions.slice(0, 60);

    return productOptions
      .filter((product) => product.searchKey.includes(normalizedSearch))
      .slice(0, 60);
  };

  const getLineProductInputValue = (line: ReceiptLine) => {
    if (line.productSearch) return line.productSearch;
    if (!line.productId) return "";

    return productLabelById.get(line.productId) ?? line.productId;
  };

  const positionsByLocationId = useMemo(() => {
    const map = new Map<string, LocationPositionRow[]>();

    for (const position of locationPositions) {
      const rows = map.get(position.location_id) ?? [];
      rows.push(position);
      map.set(position.location_id, rows);
    }

    for (const rows of map.values()) {
      rows.sort((a, b) => {
        const aOrder = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
        const bOrder = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;

        if (aOrder !== bOrder) return aOrder - bOrder;

        return formatLocationPositionLabel(a).localeCompare(formatLocationPositionLabel(b), "es", {
          numeric: true,
          sensitivity: "base",
        });
      });
    }

    return map;
  }, [locationPositions]);

  useEffect(() => {
    window.sessionStorage.removeItem(legacyStorageKey);
  }, [legacyStorageKey]);

  useEffect(() => {
    if (submitSuccess) {
      window.sessionStorage.removeItem(storageKey);
      window.sessionStorage.removeItem(legacyStorageKey);
    }
  }, [legacyStorageKey, storageKey, submitSuccess]);

  useEffect(() => {
    const payload = {
      supplierId,
      invoiceNumber,
      notes,
      receivedAt,
      emergencyReason,
      lines,
    };
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  }, [emergencyReason, invoiceNumber, lines, notes, receivedAt, storageKey, supplierId]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        productId: "",
        productSearch: "",
        locationId: defaultLocationId,
        positionId: "",
        quantity: "",
        unitCost: "",
        lotNumber: "",
        expiryDate: "",
        notes: "",
        purchaseOrderItemId: "",
        presentationId: "",
        inputUnitCode: "",
        inputUnitLabel: "",
        conversionFactorToStock: "1",
        stockUnitCode: "",
      },
    ]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, patch: Partial<ReceiptLine>) => {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const onPurchaseOrderChange = (nextPoId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPoId) params.set("purchase_order_id", nextPoId);
    else params.delete("purchase_order_id");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const handleClientValidation = (event: React.FormEvent<HTMLFormElement>) => {
    const nextErrors: Record<string, string> = {};
    if (!supplierId) nextErrors["supplier_id"] = "Selecciona un proveedor.";
    if (entryMode === "emergency" && !emergencyReason.trim()) {
      nextErrors["emergency_reason"] = "Escribe el motivo de la recepción de emergencia.";
    }

    const hasAtLeastOneValidLine = lines.some((line) => {
      const qty = Number(line.quantity || 0);
      const factor = Number(line.conversionFactorToStock || 0);
      const hasPresentationSnapshot =
        entryMode === "emergency" ||
        (Boolean(line.purchaseOrderItemId) && Boolean(line.inputUnitLabel) && factor > 0);

      return Boolean(line.productId) && hasPresentationSnapshot && Number.isFinite(qty) && qty > 0;
    });
    if (!hasAtLeastOneValidLine) {
      nextErrors["lines"] = "Agrega al menos un item con producto y cantidad mayor a 0.";
    }

    lines.forEach((line, index) => {
      const qty = Number(line.quantity || 0);
      const hasQty = Number.isFinite(qty) && qty > 0;
      const hasProduct = Boolean(line.productId);
      const shouldValidateLine = hasQty || hasProduct;
      if (!shouldValidateLine) return;

      if (!hasProduct) nextErrors[`line_${index}_productId`] = "Selecciona producto.";
      if (!hasQty) nextErrors[`line_${index}_quantity`] = "Ingresa cantidad valida.";
      if (!line.locationId) nextErrors[`line_${index}_locationId`] = "Selecciona LOC.";

      if (entryMode === "normal" && !line.purchaseOrderItemId) {
        nextErrors[`line_${index}_presentation`] = "La línea no pertenece a la orden de compra seleccionada.";
      }

      if (
        entryMode === "normal" &&
        (!line.inputUnitLabel.trim() || Number(line.conversionFactorToStock || 0) <= 0)
      ) {
        nextErrors[`line_${index}_presentation`] = "La línea no tiene presentación válida desde la OC.";
      }

      const product = line.productId ? productMap.get(line.productId) : null;
      if (product?.lot_tracking && !line.lotNumber.trim()) {
        nextErrors[`line_${index}_lotNumber`] = "Este producto requiere lote.";
      }
      if (product?.expiry_tracking && !line.expiryDate.trim()) {
        nextErrors[`line_${index}_expiryDate`] = "Este producto requiere vencimiento.";
      }
    });

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      event.preventDefault();
    }
  };

  return (
    <form action={action} className="ui-panel space-y-4" onSubmit={handleClientValidation}>
      <input type="hidden" name="site_id" value={siteId} />
      <input type="hidden" name="purchase_order_id" value={selectedPurchaseOrderId} />
      <input type="hidden" name="entry_mode" value={entryMode} />
      <input type="hidden" name="emergency_reason" value={emergencyReason} />

      <div className="grid gap-3 md:grid-cols-4">
        {hasPurchaseOrderOptions ? (
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="ui-label">Orden de compra</span>
            <select
              className="ui-input"
              value={selectedPurchaseOrderId}
              onChange={(e) => onPurchaseOrderChange(e.target.value)}
            >
              <option value="">Emergencia / sin orden de compra</option>
              {poOptions.map((po) => (
                <option key={po.value} value={po.value}>
                  {po.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <div className="font-semibold">Emergencia / sin orden de compra</div>
            <p className="mt-1">
              No hay órdenes de compra activas para esta sede. Esta recepción se registrará como emergencia.
            </p>
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="ui-label">Proveedor</span>
          <select
            name="supplier_id"
            className="ui-input"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            required
          >
            <option value="">Seleccionar</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name ?? supplier.id}
              </option>
            ))}
          </select>
          {fieldErrors["supplier_id"] ? (
            <span className="text-xs text-rose-600">{fieldErrors["supplier_id"]}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Fecha recepción</span>
          <input
            type="date"
            name="received_at"
            className="ui-input"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
          />
        </label>
      </div>

      {entryMode === "normal" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <div className="font-semibold">Recepción normal</div>
          <p className="mt-1">
            Esta recepción quedará vinculada a la orden de compra seleccionada.
          </p>
        </div>
      ) : hasPurchaseOrderOptions ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="font-semibold">Recepción de emergencia</div>
          <p className="mt-1">
            Esta recepción no está vinculada a una orden de compra. Registra el motivo para dejar trazabilidad.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="ui-label">Factura / referencia</span>
          <input
            name="invoice_number"
            className="ui-input"
            placeholder={entryMode === "emergency" ? "Referencia obligatoria si aplica" : "FAC-0001"}
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Notas</span>
          <input
            name="notes"
            className="ui-input"
            placeholder="Observaciones de recepcion"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </div>

      {entryMode === "emergency" ? (
        <label className="flex flex-col gap-1">
          <span className="ui-label">Motivo de emergencia</span>
          <input
            className="ui-input"
            placeholder="Ej: compra urgente sin OC por falta de stock"
            value={emergencyReason}
            onChange={(e) => setEmergencyReason(e.target.value)}
            required
          />
          {fieldErrors["emergency_reason"] ? (
            <span className="text-xs text-rose-600">{fieldErrors["emergency_reason"]}</span>
          ) : null}
        </label>
      ) : null}

      <div className="flex items-center justify-between">
        <div className="ui-h3">Items de recepcion</div>
        {!isPurchaseOrderReceipt ? (
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={addLine}>
            + Agregar item
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        {fieldErrors["lines"] ? (
          <p className="text-sm text-rose-600">{fieldErrors["lines"]}</p>
        ) : null}
        {lines.map((line, index) => {
          const product = line.productId ? productMap.get(line.productId) : undefined;
          const stockUnitCode = line.stockUnitCode || getProductStockUnitCode(product);
          const inputUnitLabel = line.inputUnitLabel || line.inputUnitCode || stockUnitCode;
          const inputQty = Number(line.quantity || 0);
          const conversionFactorToStock = Number(line.conversionFactorToStock || 0);
          const stockQty =
            inputQty > 0 && conversionFactorToStock > 0
              ? inputQty * conversionFactorToStock
              : 0;
          const inputUnitCost = Number(line.unitCost || 0);
          const stockUnitCost =
            inputUnitCost > 0 && conversionFactorToStock > 0
              ? inputUnitCost / conversionFactorToStock
              : 0;

          return (
            <div key={`line-${index}`} className="ui-panel-soft grid gap-3 md:grid-cols-8">
              <div className="md:col-span-8 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--ui-text)]">
                    Item {index + 1}
                  </div>
                  <div className="text-xs text-[var(--ui-muted)]">
                    Selecciona producto, destino operativo y cantidad recibida.
                  </div>
                </div>

                <button
                  type="button"
                  className="ui-btn ui-btn--ghost ui-btn--sm shrink-0"
                  onClick={() => removeLine(index)}
                  disabled={lines.length <= 1}
                >
                  Quitar
                </button>
              </div>

              <div className="md:col-span-2">
                <label className="block">
                  <span className="ui-label">Producto</span>
                  <input
                    className="ui-input mt-1 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    list={`receipt-products-${index}`}
                    placeholder="Buscar producto por nombre o unidad"
                    value={getLineProductInputValue(line)}
                    autoComplete="off"
                    disabled={isPurchaseOrderReceipt}
                    onChange={(e) => {
                      const nextSearch = e.target.value;
                      const matchedProductId = productIdByLabel.get(nextSearch) ?? "";

                      const matchedProduct = matchedProductId ? productMap.get(matchedProductId) : undefined;
                      const matchedStockUnitCode = getProductStockUnitCode(matchedProduct);

                      updateLine(index, {
                        productSearch: nextSearch,
                        productId: matchedProductId,
                        presentationId: "",
                        inputUnitCode: matchedStockUnitCode,
                        inputUnitLabel: matchedStockUnitCode,
                        conversionFactorToStock: "1",
                        stockUnitCode: matchedStockUnitCode,
                      });
                    }}
                  />
                </label>

                <datalist id={`receipt-products-${index}`}>
                  {getProductSuggestions(getLineProductInputValue(line)).map((product) => (
                    <option key={product.id} value={product.label} />
                  ))}
                </datalist>

                <input type="hidden" name="item_product_id" value={line.productId} />
                <input type="hidden" name="item_presentation_id" value={line.presentationId} />
                <input type="hidden" name="item_input_unit_code" value={line.inputUnitCode || stockUnitCode} />
                <input type="hidden" name="item_input_unit_label" value={inputUnitLabel} />
                <input
                  type="hidden"
                  name="item_conversion_factor_to_stock"
                  value={conversionFactorToStock > 0 ? String(conversionFactorToStock) : "1"}
                />
                <input type="hidden" name="item_stock_unit_code" value={stockUnitCode} />
                <input
                  type="hidden"
                  name="item_purchase_order_item_id"
                  value={line.purchaseOrderItemId}
                />

                {line.productId ? (
                  <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">Producto seleccionado</div>
                        <div className="mt-0.5">
                          {productLabelById.get(line.productId) ?? line.productId}
                        </div>
                        <div className="mt-1 text-emerald-800">
                          {productMap.get(line.productId)?.lot_tracking ? "Requiere lote" : "Sin lote"} ·{" "}
                          {productMap.get(line.productId)?.expiry_tracking
                            ? "Requiere vencimiento"
                            : "Sin vencimiento"}
                        </div>

                        <div className="mt-1 text-emerald-800">
                          Presentación: {inputUnitLabel}
                        </div>

                        {conversionFactorToStock > 0 ? (
                          <div className="mt-1 text-emerald-800">
                            1 {inputUnitLabel} = {formatQty(conversionFactorToStock)} {stockUnitCode}
                          </div>
                        ) : null}
                      </div>
                      {!isPurchaseOrderReceipt ? (
                        <button
                          type="button"
                          className="rounded-full border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-900"
                          onClick={() =>
                            updateLine(index, {
                              productId: "",
                              productSearch: "",
                              purchaseOrderItemId: "",
                              presentationId: "",
                              inputUnitCode: "",
                              inputUnitLabel: "",
                              conversionFactorToStock: "1",
                              stockUnitCode: "",
                            })
                          }
                        >
                          Cambiar
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : line.productSearch ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Selecciona una opción exacta de la lista para validar el producto.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[var(--ui-muted)]">
                    Escribe y selecciona un producto de la lista.
                  </p>
                )}

                {fieldErrors[`line_${index}_productId`] ? (
                  <p className="mt-1 text-xs text-rose-600">{fieldErrors[`line_${index}_productId`]}</p>
                ) : null}
              </div>

              <label>
                <span className="ui-label">Destino operativo</span>
                <select
                  name="item_location_id"
                  className="ui-input mt-1"
                  value={line.locationId}
                  onChange={(e) => updateLine(index, { locationId: e.target.value, positionId: "" })}
                >
                  <option value="">Seleccionar</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {formatReceiptLocationLabel(location)}
                    </option>
                  ))}
                </select>
                {fieldErrors[`line_${index}_locationId`] ? (
                  <p className="mt-1 text-xs text-rose-600">{fieldErrors[`line_${index}_locationId`]}</p>
                ) : null}
              </label>

              {positionsByLocationId.get(line.locationId)?.length ? (
                <label>
                  <span className="ui-label">Ubicación interna</span>
                  <select
                    name="item_location_position_id"
                    className="ui-input mt-1"
                    value={line.positionId}
                    onChange={(e) => updateLine(index, { positionId: e.target.value })}
                  >
                    <option value="">Sin posición interna</option>
                    {positionsByLocationId.get(line.locationId)?.map((position) => (
                      <option key={position.id} value={position.id}>
                        {formatLocationPositionLabel(position)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-[var(--ui-muted)]">
                    Opcional. Úsalo para estantería, piso, nivel o bin.
                  </p>
                </label>
              ) : (
                <input type="hidden" name="item_location_position_id" value="" />
              )}

              <label>
                <span className="ui-label">Cantidad recibida</span>
                <input
                  name="item_quantity_received"
                  className="ui-input mt-1"
                  type="number"
                  step="0.000001"
                  min="0"
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: e.target.value })}
                />
                <p className="mt-1 text-xs text-[var(--ui-muted)]">
                  {inputQty > 0 && conversionFactorToStock > 0
                    ? `${formatQty(inputQty)} ${inputUnitLabel} = ${formatQty(stockQty)} ${stockUnitCode}`
                    : `Cantidad en ${inputUnitLabel}.`}
                </p>
                {fieldErrors[`line_${index}_quantity`] ? (
                  <p className="mt-1 text-xs text-rose-600">{fieldErrors[`line_${index}_quantity`]}</p>
                ) : null}
                {fieldErrors[`line_${index}_presentation`] ? (
                  <p className="mt-1 text-xs text-rose-600">{fieldErrors[`line_${index}_presentation`]}</p>
                ) : null}
              </label>

              <label>
                <span className="ui-label">Costo unitario</span>
                <input
                  name="item_unit_cost"
                  className="ui-input mt-1"
                  type="number"
                  step="0.01"
                  min="0"
                  value={line.unitCost}
                  onChange={(e) => updateLine(index, { unitCost: e.target.value })}
                />
                <p className="mt-1 text-xs text-[var(--ui-muted)]">
                  {inputUnitCost > 0 && stockUnitCost > 0
                    ? `${formatAmount(inputUnitCost)} por ${inputUnitLabel} · ${formatAmount(stockUnitCost)} por ${stockUnitCode}`
                    : `Costo por ${inputUnitLabel}.`}
                </p>
              </label>

              <label>
                <span className="ui-label">Lote</span>
                <input
                  name="item_lot_number"
                  className="ui-input mt-1"
                  placeholder="Opcional"
                  value={line.lotNumber}
                  onChange={(e) => updateLine(index, { lotNumber: e.target.value })}
                  required={Boolean(line.productId && productMap.get(line.productId)?.lot_tracking)}
                />
                {fieldErrors[`line_${index}_lotNumber`] ? (
                  <p className="mt-1 text-xs text-rose-600">{fieldErrors[`line_${index}_lotNumber`]}</p>
                ) : null}
              </label>

              <label>
                <span className="ui-label">Vencimiento</span>
                <input
                  name="item_expiry_date"
                  className="ui-input mt-1"
                  type="date"
                  value={line.expiryDate}
                  onChange={(e) => updateLine(index, { expiryDate: e.target.value })}
                  required={Boolean(line.productId && productMap.get(line.productId)?.expiry_tracking)}
                />
                {fieldErrors[`line_${index}_expiryDate`] ? (
                  <p className="mt-1 text-xs text-rose-600">{fieldErrors[`line_${index}_expiryDate`]}</p>
                ) : null}
              </label>

              <label>
                <span className="ui-label">Notas item</span>
                <input
                  name="item_notes"
                  className="ui-input mt-1"
                  placeholder="Opcional"
                  value={line.notes}
                  onChange={(e) => updateLine(index, { notes: e.target.value })}
                />
              </label>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        {serverErrorMessage ? (
          <p className="mr-auto text-sm text-rose-600">{serverErrorMessage}</p>
        ) : null}
        <button type="submit" className="ui-btn ui-btn--brand">
          Registrar recepcion
        </button>
      </div>
    </form>
  );
}
