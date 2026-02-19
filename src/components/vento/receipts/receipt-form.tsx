"use client";

import { useMemo, useState } from "react";
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

  const poOptions = useMemo(
    () =>
      purchaseOrders.map((po) => ({
        value: po.id,
        label: `${formatPurchaseOrderRef({ id: po.id, createdAt: po.created_at })} - ${po.suppliers?.name ?? "Proveedor"} - ${po.status ?? "-"}`,
      })),
    [purchaseOrders]
  );

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        productId: "",
        locationId: defaultLocationId,
        quantity: "",
        unitCost: "",
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

  return (
    <form action={action} className="ui-panel space-y-4">
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
        {lines.map((line, index) => (
          <div key={`line-${index}`} className="ui-panel-soft grid gap-3 md:grid-cols-6">
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
        <button type="submit" className="ui-btn ui-btn--brand">
          Registrar recepcion
        </button>
      </div>
    </form>
  );
}
