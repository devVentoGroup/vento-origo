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
};

type ReceiptLine = {
  productId: string;
  locationId: string;
  quantity: string;
  unitCost: string;
  lotNumber: string;
  expiryDate: string;
  notes: string;
  purchaseOrderItemId: string;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  siteId: string;
  suppliers: SupplierRow[];
  products: ProductRow[];
  locations: LocationRow[];
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
        locationId: params.defaultLocationId,
        quantity: "",
        unitCost: "",
        lotNumber: "",
        expiryDate: "",
        notes: "",
        purchaseOrderItemId: "",
      },
    ];
  }

  return params.prefillRows.map((row) => ({
    productId: row.productId,
    locationId: params.defaultLocationId,
    quantity: String(row.quantity),
    unitCost: row.unitCost > 0 ? String(row.unitCost) : "",
    lotNumber: "",
    expiryDate: "",
    notes: "",
    purchaseOrderItemId: row.purchaseOrderItemId,
  }));
}

export function ReceiptForm({
  action,
  siteId,
  suppliers,
  products,
  locations,
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

  const [supplierId, setSupplierId] = useState(prefillSupplierId);
  const [invoiceNumber, setInvoiceNumber] = useState(prefillInvoiceNumber);
  const [notes, setNotes] = useState(prefillNotes);
  const [receivedAt, setReceivedAt] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>(
    buildInitialRows({ prefillRows, defaultLocationId })
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const poOptions = useMemo(
    () =>
      purchaseOrders.map((po) => ({
        value: po.id,
        label: `${formatPurchaseOrderRef({ id: po.id, createdAt: po.created_at })} - ${po.suppliers?.name ?? "Proveedor"} - ${po.status ?? "-"}`,
      })),
    [purchaseOrders]
  );

  const productMap = useMemo(() => {
    const map = new Map<string, ProductRow>();
    for (const product of products) map.set(product.id, product);
    return map;
  }, [products]);

  const storageKey = useMemo(() => `origo:receipts:form:${siteId}`, [siteId]);

  useEffect(() => {
    if (submitSuccess) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        supplierId?: string;
        invoiceNumber?: string;
        notes?: string;
        receivedAt?: string;
        lines?: ReceiptLine[];
      };
      if (parsed.supplierId != null) setSupplierId(parsed.supplierId);
      if (parsed.invoiceNumber != null) setInvoiceNumber(parsed.invoiceNumber);
      if (parsed.notes != null) setNotes(parsed.notes);
      if (parsed.receivedAt != null) setReceivedAt(parsed.receivedAt);
      if (Array.isArray(parsed.lines) && parsed.lines.length) {
        setLines(
          parsed.lines.map((line) => ({
            productId: line.productId ?? "",
            locationId: line.locationId ?? defaultLocationId,
            quantity: line.quantity ?? "",
            unitCost: line.unitCost ?? "",
            lotNumber: line.lotNumber ?? "",
            expiryDate: line.expiryDate ?? "",
            notes: line.notes ?? "",
            purchaseOrderItemId: line.purchaseOrderItemId ?? "",
          }))
        );
      }
    } catch {
      // noop
    }
  }, [defaultLocationId, storageKey, submitSuccess]);

  useEffect(() => {
    const payload = {
      supplierId,
      invoiceNumber,
      notes,
      receivedAt,
      lines,
    };
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  }, [invoiceNumber, lines, notes, receivedAt, storageKey, supplierId]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        productId: "",
        locationId: defaultLocationId,
        quantity: "",
        unitCost: "",
        lotNumber: "",
        expiryDate: "",
        notes: "",
        purchaseOrderItemId: "",
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

    const hasAtLeastOneValidLine = lines.some((line) => {
      const qty = Number(line.quantity || 0);
      return Boolean(line.productId) && Number.isFinite(qty) && qty > 0;
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

      <div className="grid gap-3 md:grid-cols-4">
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="ui-label">Orden de compra (opcional)</span>
          <select
            className="ui-input"
            value={selectedPurchaseOrderId}
            onChange={(e) => onPurchaseOrderChange(e.target.value)}
          >
            <option value="">Sin orden de compra</option>
            {poOptions.map((po) => (
              <option key={po.value} value={po.value}>
                {po.label}
              </option>
            ))}
          </select>
        </label>

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
          <span className="ui-label">Fecha recepcion</span>
          <input
            type="date"
            name="received_at"
            className="ui-input"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="ui-label">Factura / referencia</span>
          <input
            name="invoice_number"
            className="ui-input"
            placeholder="FAC-0001"
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

      <div className="flex items-center justify-between">
        <div className="ui-h3">Items de recepcion</div>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={addLine}>
          + Agregar item
        </button>
      </div>

      <div className="space-y-3">
        {fieldErrors["lines"] ? (
          <p className="text-sm text-rose-600">{fieldErrors["lines"]}</p>
        ) : null}
        {lines.map((line, index) => (
          <div key={`line-${index}`} className="ui-panel-soft grid gap-3 md:grid-cols-8">
            <label className="md:col-span-2">
              <span className="ui-label">Producto</span>
              <select
                name="item_product_id"
                className="ui-input mt-1"
                value={line.productId}
                onChange={(e) => updateLine(index, { productId: e.target.value })}
              >
                <option value="">Seleccionar</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name ?? product.id}
                  </option>
                ))}
              </select>
              <input
                type="hidden"
                name="item_purchase_order_item_id"
                value={line.purchaseOrderItemId}
              />
              {line.productId ? (
                <p className="mt-1 text-xs text-[var(--ui-muted)]">
                  {productMap.get(line.productId)?.lot_tracking ? "Requiere lote" : "Sin lote"} ·{" "}
                  {productMap.get(line.productId)?.expiry_tracking
                    ? "Requiere vencimiento"
                    : "Sin vencimiento"}
                </p>
              ) : null}
              {fieldErrors[`line_${index}_productId`] ? (
                <p className="mt-1 text-xs text-rose-600">{fieldErrors[`line_${index}_productId`]}</p>
              ) : null}
            </label>

            <label>
              <span className="ui-label">LOC destino</span>
              <select
                name="item_location_id"
                className="ui-input mt-1"
                value={line.locationId}
                onChange={(e) => updateLine(index, { locationId: e.target.value })}
              >
                <option value="">Seleccionar</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code ?? location.description ?? location.id}
                  </option>
                ))}
              </select>
              {fieldErrors[`line_${index}_locationId`] ? (
                <p className="mt-1 text-xs text-rose-600">{fieldErrors[`line_${index}_locationId`]}</p>
              ) : null}
            </label>

            <label>
              <span className="ui-label">Cantidad</span>
              <input
                name="item_quantity_received"
                className="ui-input mt-1"
                type="number"
                step="0.000001"
                min="0"
                value={line.quantity}
                onChange={(e) => updateLine(index, { quantity: e.target.value })}
              />
              {fieldErrors[`line_${index}_quantity`] ? (
                <p className="mt-1 text-xs text-rose-600">{fieldErrors[`line_${index}_quantity`]}</p>
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

            <div className="md:col-span-6 flex justify-end">
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--sm"
                onClick={() => removeLine(index)}
                disabled={lines.length <= 1}
              >
                Quitar item
              </button>
            </div>
          </div>
        ))}
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
