"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatPurchaseOrderRef } from "@/lib/purchase-orders/reference";

type SupplierRow = {
  id: string;
  name: string | null;
};

type ProductPresentationOption = {
  id: string;
  product_id: string;
  label: string;
  input_unit_code: string;
  qty_in_stock_unit: number;
  is_default?: boolean | null;
  last_net_unit_cost?: number | null;
  avg_net_unit_cost?: number | null;
  last_stock_unit_cost?: number | null;
  avg_stock_unit_cost?: number | null;
  last_received_at?: string | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  cost: number | null;
  lot_tracking: boolean;
  expiry_tracking: boolean;
  supplier_ids?: string[] | null;
  presentations?: ProductPresentationOption[] | null;
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

type CostInputMode = "net" | "gross";

type MasterDataRequestKind = "new_product" | "new_presentation";

type MasterDataRequestDraft = {
  kind: MasterDataRequestKind;
  lineIndex: number;
  requestedLabel: string;
  inputUnitLabel: string;
  conversionFactorToStock: string;
  stockUnitCode: string;
  unitCost: string;
  notes: string;
};

type MasterDataRequestPayload = {
  id: string;
  kind: MasterDataRequestKind;
  status: "pending_review";
  source: "origo_receipt";
  siteId: string;
  supplierId: string;
  supplierName: string | null;
  lineIndex: number;
  productId: string | null;
  productName: string | null;
  requestedLabel: string;
  inputUnitCode: string;
  inputUnitLabel: string;
  conversionFactorToStock: number | null;
  stockUnitCode: string;
  unitCost: number | null;
  notes: string | null;
  createdAt: string;
};

type ReceiptLine = {
  productId: string;
  productSearch: string;
  locationId: string;
  positionId: string;
  quantity: string;
  unitCost: string;
  costInputMode: CostInputMode;
  taxRate: string;
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
  isExceptionReceipt?: boolean;
  lines?: ReceiptLine[];
  masterDataRequests?: MasterDataRequestPayload[];
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

const DIRECT_RECEIPT_REASON = "Recepción directa sin orden de compra.";

const RECEIPT_LOCATION_LABELS_BY_CODE: Record<string, string> = {
  "LOC-CP-BOD-MAIN": "Bodega principal",
  "LOC-CP-N3P-MAIN": "Nevera 3 puertas",
  "LOC-CP-FRIO-MAIN": "Cuarto de enfriamiento",
  "LOC-CP-CONG-MAIN": "Cuarto de congelación",
  "LOC-CP-PROD-COC-01": "Operación · Cocina caliente",
  "LOC-CP-PROD-PAN-01": "Operación · Galletería y panadería",
  "LOC-CP-PROD-REP-01": "Operación · Repostería",
};

function makeEmptyLine(defaultLocationId: string): ReceiptLine {
  return {
    productId: "",
    productSearch: "",
    locationId: defaultLocationId,
    positionId: "",
    quantity: "",
    unitCost: "",
    costInputMode: "net",
    taxRate: "0",
    lotNumber: "",
    expiryDate: "",
    notes: "",
    purchaseOrderItemId: "",
    presentationId: "",
    inputUnitCode: "",
    inputUnitLabel: "",
    conversionFactorToStock: "1",
    stockUnitCode: "",
  };
}

function buildInitialRows(params: {
  prefillRows: PrefillRow[];
  defaultLocationId: string;
}): ReceiptLine[] {
  if (!params.prefillRows.length) return [makeEmptyLine(params.defaultLocationId)];

  return params.prefillRows.map((row) => ({
    productId: row.productId,
    productSearch: "",
    locationId: params.defaultLocationId,
    positionId: "",
    quantity: String(row.quantity),
    unitCost: row.unitCost > 0 ? String(row.unitCost) : "",
    costInputMode: "net",
    taxRate: "0",
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

function normalizeStoredLines(
  lines: ReceiptLine[] | undefined,
  defaultLocationId: string
): ReceiptLine[] | null {
  if (!Array.isArray(lines) || !lines.length) return null;
  return lines.map((line): ReceiptLine => ({
    productId: line.productId ?? "",
    productSearch: line.productSearch ?? "",
    locationId: line.locationId ?? defaultLocationId,
    positionId: line.positionId ?? "",
    quantity: line.quantity ?? "",
    unitCost: line.unitCost ?? "",
    costInputMode: (line.costInputMode === "gross" ? "gross" : "net") as CostInputMode,
    taxRate: line.taxRate ?? "0",
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

function normalizeMasterDataRequests(
  requests: MasterDataRequestPayload[] | undefined
): MasterDataRequestPayload[] {
  if (!Array.isArray(requests)) return [];
  return requests.filter((request) => {
    return (
      request &&
      (request.kind === "new_product" || request.kind === "new_presentation") &&
      String(request.requestedLabel ?? "").trim().length > 0
    );
  });
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
      masterDataRequests: normalizeMasterDataRequests(parsed.masterDataRequests),
    };
  } catch {
    return null;
  }
}

function asNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

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

function normalizeUnitCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
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

function getUniquePresentations(
  presentations: ProductPresentationOption[] | null | undefined
): ProductPresentationOption[] {
  const unique: ProductPresentationOption[] = [];
  const seen = new Set<string>();

  for (const presentation of presentations ?? []) {
    const factor = Number(presentation.qty_in_stock_unit ?? 0);
    if (!presentation.id || !Number.isFinite(factor) || factor <= 0) continue;

    const label = String(presentation.label ?? presentation.input_unit_code ?? "Presentación").trim();
    const inputUnitCode = String(presentation.input_unit_code ?? label).trim().toLowerCase();
    const key = [
      label
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim(),
      inputUnitCode,
      String(Math.round(factor * 1000000) / 1000000),
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(presentation);
  }

  return unique;
}

function getPresentationSuggestedUnitCost(
  product: ProductRow | undefined,
  presentation: ProductPresentationOption | null | undefined,
  factor: number
): number {
  const lastCost = Number(presentation?.last_net_unit_cost ?? 0);
  if (Number.isFinite(lastCost) && lastCost > 0) return lastCost;

  const avgCost = Number(presentation?.avg_net_unit_cost ?? 0);
  if (Number.isFinite(avgCost) && avgCost > 0) return avgCost;

  const productCost = Number(product?.cost ?? 0);
  if (Number.isFinite(productCost) && productCost > 0 && factor > 0) {
    return productCost * factor;
  }

  return 0;
}

function formatUnitCostForInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return String(Math.round(value * 100) / 100);
}

function getRequestKindLabel(kind: MasterDataRequestKind): string {
  return kind === "new_product" ? "Nuevo insumo" : "Nueva presentación";
}

function computeRequestInputUnitCode(request: MasterDataRequestDraft): string {
  return normalizeUnitCode(request.inputUnitLabel || request.requestedLabel) || request.stockUnitCode || "un";
}

function computeLineCost(line: ReceiptLine) {
  const inputQty = clampNonNegative(asNumber(line.quantity));
  const inputUnitCost = clampNonNegative(asNumber(line.unitCost));
  const taxRate = clampNonNegative(asNumber(line.taxRate));
  const conversionFactorToStock = clampNonNegative(asNumber(line.conversionFactorToStock)) || 1;

  const netUnitCost =
    line.costInputMode === "gross" && taxRate > 0
      ? inputUnitCost / (1 + taxRate / 100)
      : inputUnitCost;

  const grossUnitCost =
    line.costInputMode === "gross"
      ? inputUnitCost
      : inputUnitCost * (1 + taxRate / 100);

  const stockQty = inputQty * conversionFactorToStock;
  const stockUnitCost = conversionFactorToStock > 0 ? netUnitCost / conversionFactorToStock : 0;
  const netTotal = netUnitCost * inputQty;
  const grossTotal = grossUnitCost * inputQty;
  const taxAmount = grossTotal - netTotal;

  return {
    inputQty,
    inputUnitCost,
    taxRate,
    conversionFactorToStock,
    stockQty,
    netUnitCost,
    grossUnitCost,
    stockUnitCost,
    netTotal,
    grossTotal,
    taxAmount,
    taxIncluded: line.costInputMode === "gross",
  };
}

function positionBaseLabel(position: LocationPositionRow) {
  const name = String(position.name || position.code || position.id).trim();
  const code = String(position.code || "").trim();
  if (!code || code === name) return name;
  return `${name} (${code})`;
}

function buildPositionPath(position: LocationPositionRow, positionById: Map<string, LocationPositionRow>) {
  const chain: string[] = [];
  const visited = new Set<string>();
  let current: LocationPositionRow | undefined = position;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(positionBaseLabel(current));
    current = current.parent_position_id ? positionById.get(current.parent_position_id) : undefined;
  }

  return chain.join(" > ");
}

function positionTreeBaseLabel(position: LocationPositionRow) {
  return String(position.name || position.code || position.id).trim();
}

function buildPositionTreeOptions(
  positions: LocationPositionRow[],
  positionById: Map<string, LocationPositionRow>
): Array<{ position: LocationPositionRow; label: string }> {
  const positionIds = new Set(positions.map((position) => position.id));
  const childrenByParent = new Map<string, LocationPositionRow[]>();
  const roots: LocationPositionRow[] = [];

  for (const position of positions) {
    const parentId = position.parent_position_id;
    const parent = parentId ? positionById.get(parentId) : null;
    const hasLocalParent =
      Boolean(parentId) &&
      Boolean(parent) &&
      parent?.location_id === position.location_id &&
      positionIds.has(parentId as string);

    if (!hasLocalParent) {
      roots.push(position);
      continue;
    }

    const children = childrenByParent.get(parentId as string) ?? [];
    children.push(position);
    childrenByParent.set(parentId as string, children);
  }

  const sortPositions = (rows: LocationPositionRow[]) =>
    rows.sort((a, b) => {
      const aOrder = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
      const bOrder = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;

      return positionTreeBaseLabel(a).localeCompare(positionTreeBaseLabel(b), "es", {
        numeric: true,
        sensitivity: "base",
      });
    });

  sortPositions(roots);
  for (const children of childrenByParent.values()) sortPositions(children);

  const options: Array<{ position: LocationPositionRow; label: string }> = [];
  const visit = (position: LocationPositionRow, depth: number) => {
    const prefix = depth === 0 ? "▾ " : `${"  ".repeat(depth)}↳ `;
    options.push({
      position,
      label: `${prefix}${positionTreeBaseLabel(position)}`,
    });

    for (const child of childrenByParent.get(position.id) ?? []) {
      visit(child, depth + 1);
    }
  };

  for (const root of roots) visit(root, 0);

  return options;
}

function shortProductName(product: ProductRow | undefined) {
  return String(product?.name ?? "Producto").trim();
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
  const receiptDraftScope = selectedPurchaseOrderId ? `po:${selectedPurchaseOrderId}` : "direct";
  const storageKey = `origo:receipts:form:${siteId}:${receiptDraftScope}`;
  const legacyStorageKey = `origo:receipts:form:${siteId}`;
  const storedDraft = readStoredDraft(storageKey, defaultLocationId);

  const [supplierId, setSupplierId] = useState(
    selectedPurchaseOrderId ? prefillSupplierId : storedDraft?.supplierId ?? prefillSupplierId
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    selectedPurchaseOrderId ? prefillInvoiceNumber : storedDraft?.invoiceNumber ?? prefillInvoiceNumber
  );
  const [notes, setNotes] = useState(
    selectedPurchaseOrderId ? prefillNotes : storedDraft?.notes ?? prefillNotes
  );
  const [receivedAt, setReceivedAt] = useState(storedDraft?.receivedAt ?? "");
  const [isExceptionReceipt, setIsExceptionReceipt] = useState(Boolean(storedDraft?.isExceptionReceipt));
  const [emergencyReason, setEmergencyReason] = useState(storedDraft?.emergencyReason ?? "");
  const [activeProductPickerIndex, setActiveProductPickerIndex] = useState<number | null>(null);
  const [lines, setLines] = useState<ReceiptLine[]>(() => {
    const initialRows = buildInitialRows({ prefillRows, defaultLocationId });

    // When receiving against a PO, always trust the server prefill. A stale browser draft
    // can otherwise hide the product lines loaded from purchase_order_items.
    if (selectedPurchaseOrderId) return initialRows;

    return storedDraft?.lines?.length ? storedDraft.lines : initialRows;
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [requestDraft, setRequestDraft] = useState<MasterDataRequestDraft | null>(null);
  const [masterDataRequests, setMasterDataRequests] = useState<MasterDataRequestPayload[]>(() =>
    normalizeMasterDataRequests(storedDraft?.masterDataRequests)
  );

  const entryMode = selectedPurchaseOrderId ? "normal" : "emergency";
  const isPurchaseOrderReceipt = entryMode === "normal";
  const isDirectReceipt = !isPurchaseOrderReceipt;
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) ?? null;
  const effectiveEmergencyReason =
    isDirectReceipt && !isExceptionReceipt
      ? DIRECT_RECEIPT_REASON
      : emergencyReason.trim();

  const poOptions = useMemo(
    () =>
      purchaseOrders.map((po) => ({
        value: po.id,
        label: `${formatPurchaseOrderRef({ id: po.id, createdAt: po.created_at })} · ${po.suppliers?.name ?? "Proveedor"} · ${po.status ?? "-"}`,
      })),
    [purchaseOrders]
  );
  const hasPurchaseOrderOptions = poOptions.length > 0;

  const productMap = useMemo(() => {
    const map = new Map<string, ProductRow>();
    for (const product of products) map.set(product.id, product);
    return map;
  }, [products]);

  const productsHaveSupplierLinks = useMemo(
    () => products.some((product) => Array.isArray(product.supplier_ids) && product.supplier_ids.length > 0),
    [products]
  );

  const supplierScopedProducts = useMemo(() => {
    if (!supplierId || !productsHaveSupplierLinks) return products;
    return products.filter((product) => Array.isArray(product.supplier_ids) && product.supplier_ids.includes(supplierId));
  }, [products, productsHaveSupplierLinks, supplierId]);

  const productLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) map.set(product.id, formatProductOptionLabel(product));
    return map;
  }, [products]);

  const positionById = useMemo(() => {
    return new Map(locationPositions.map((position) => [position.id, position]));
  }, [locationPositions]);

  const positionLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const position of locationPositions) {
      map.set(position.id, buildPositionPath(position, positionById));
    }
    return map;
  }, [locationPositions, positionById]);

  const positionsByLocationId = useMemo(() => {
    const map = new Map<string, LocationPositionRow[]>();

    for (const position of locationPositions) {
      const rows = map.get(position.location_id) ?? [];
      rows.push(position);
      map.set(position.location_id, rows);
    }

    for (const rows of map.values()) {
      rows.sort((a, b) => {
        const aPath = positionLabelById.get(a.id) ?? positionBaseLabel(a);
        const bPath = positionLabelById.get(b.id) ?? positionBaseLabel(b);

        const aOrder = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
        const bOrder = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;
        if (a.parent_position_id === b.parent_position_id && aOrder !== bOrder) return aOrder - bOrder;

        return aPath.localeCompare(bPath, "es", { numeric: true, sensitivity: "base" });
      });
    }

    return map;
  }, [locationPositions, positionLabelById]);

  const visibleProductOptionsByLine = useMemo(() => {
    return lines.map((line) => {
      const query = normalizeProductSearch(line.productSearch);
      const base = supplierScopedProducts.length ? supplierScopedProducts : products;

      if (!query) return base.slice(0, 12);

      return base
        .filter((product) => {
          const label = formatProductOptionLabel(product);
          return normalizeProductSearch(label).includes(query);
        })
        .slice(0, 12);
    });
  }, [lines, products, supplierScopedProducts]);

  const receiptTotals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        if (!line.productId) return acc;
        const cost = computeLineCost(line);
        if (cost.inputQty <= 0) return acc;

        acc.validLines += 1;
        acc.netTotal += cost.netTotal;
        acc.grossTotal += cost.grossTotal;
        acc.taxAmount += cost.taxAmount;
        acc.stockQty += cost.stockQty;

        return acc;
      },
      {
        validLines: 0,
        netTotal: 0,
        grossTotal: 0,
        taxAmount: 0,
        stockQty: 0,
      }
    );
  }, [lines]);

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
      isExceptionReceipt,
      lines,
      masterDataRequests,
    };
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  }, [
    emergencyReason,
    invoiceNumber,
    isExceptionReceipt,
    lines,
    masterDataRequests,
    notes,
    receivedAt,
    storageKey,
    supplierId,
  ]);

  const addLine = () => {
    setLines((prev) => [...prev, makeEmptyLine(defaultLocationId)]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
    setActiveProductPickerIndex((current) => (current === index ? null : current));
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

  const selectProduct = (index: number, product: ProductRow) => {
    const stockUnitCode = getProductStockUnitCode(product);

    updateLine(index, {
      productId: product.id,
      productSearch: formatProductOptionLabel(product),
      presentationId: "",
      inputUnitCode: "",
      inputUnitLabel: "",
      conversionFactorToStock: "1",
      stockUnitCode,
      unitCost: lines[index]?.unitCost || "",
    });
    setActiveProductPickerIndex(null);
  };

  const updateManualPresentation = (index: number, inputUnitLabel: string) => {
    const line = lines[index];
    const product = line.productId ? productMap.get(line.productId) : undefined;
    const stockUnitCode = line.stockUnitCode || getProductStockUnitCode(product);

    updateLine(index, {
      inputUnitLabel,
      inputUnitCode: normalizeUnitCode(inputUnitLabel) || stockUnitCode,
      presentationId: "",
    });
  };

  const openNewProductRequest = (index: number) => {
    const line = lines[index];
    setRequestDraft({
      kind: "new_product",
      lineIndex: index,
      requestedLabel: line.productSearch.trim(),
      inputUnitLabel: "",
      conversionFactorToStock: "1",
      stockUnitCode: "un",
      unitCost: line.unitCost,
      notes: "",
    });
    setActiveProductPickerIndex(null);
  };

  const openNewPresentationRequest = (index: number) => {
    const line = lines[index];
    const product = line.productId ? productMap.get(line.productId) : undefined;
    const stockUnitCode = line.stockUnitCode || getProductStockUnitCode(product);
    const currentInputUnitLabel = line.inputUnitLabel || line.inputUnitCode || "";

    if (!line.productId || !product) {
      setFieldErrors((prev) => ({
        ...prev,
        [`line_${index}_productId`]: "Selecciona primero el insumo al que pertenece la presentación.",
      }));
      return;
    }

    setRequestDraft({
      kind: "new_presentation",
      lineIndex: index,
      requestedLabel: currentInputUnitLabel && currentInputUnitLabel !== stockUnitCode ? currentInputUnitLabel : "",
      inputUnitLabel: currentInputUnitLabel && currentInputUnitLabel !== stockUnitCode ? currentInputUnitLabel : "",
      conversionFactorToStock: line.conversionFactorToStock || "1",
      stockUnitCode,
      unitCost: line.unitCost,
      notes: "",
    });
  };

  const updateRequestDraft = (patch: Partial<MasterDataRequestDraft>) => {
    setRequestDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const saveRequestDraft = () => {
    if (!requestDraft) return;

    const requestedLabel = requestDraft.requestedLabel.trim();
    const factor = Number(requestDraft.conversionFactorToStock || 0);
    const line = lines[requestDraft.lineIndex];
    const product = line?.productId ? productMap.get(line.productId) : undefined;

    if (!requestedLabel) {
      setFieldErrors((prev) => ({
        ...prev,
        master_data_request: "Escribe el nombre de la solicitud antes de agregarla.",
      }));
      return;
    }

    if (requestDraft.kind === "new_presentation") {
      if (!line?.productId || !product) {
        setFieldErrors((prev) => ({
          ...prev,
          master_data_request: "Selecciona el producto antes de solicitar una presentación.",
        }));
        return;
      }

      if (!Number.isFinite(factor) || factor <= 0) {
        setFieldErrors((prev) => ({
          ...prev,
          master_data_request: "El factor a stock debe ser mayor a 0.",
        }));
        return;
      }

      // La solicitud queda pendiente para maestro de datos. No se usa como presentación
      // real de recepción hasta que exista como presentación manual activa en catálogo.
    }

    if (requestDraft.kind === "new_product" && line) {
      updateLine(requestDraft.lineIndex, {
        productSearch: requestedLabel,
      });
    }

    const payload: MasterDataRequestPayload = {
      id: `${requestDraft.kind}:${requestDraft.lineIndex}:${Date.now()}`,
      kind: requestDraft.kind,
      status: "pending_review",
      source: "origo_receipt",
      siteId,
      supplierId,
      supplierName: selectedSupplier?.name ?? null,
      lineIndex: requestDraft.lineIndex,
      productId: requestDraft.kind === "new_presentation" ? line?.productId || null : null,
      productName: requestDraft.kind === "new_presentation" ? product?.name ?? null : null,
      requestedLabel,
      inputUnitCode: computeRequestInputUnitCode(requestDraft),
      inputUnitLabel: requestDraft.inputUnitLabel.trim() || requestedLabel,
      conversionFactorToStock:
        requestDraft.kind === "new_presentation" && Number.isFinite(factor) && factor > 0 ? factor : null,
      stockUnitCode: requestDraft.stockUnitCode || getProductStockUnitCode(product),
      unitCost: Number(requestDraft.unitCost || 0) > 0 ? Number(requestDraft.unitCost) : null,
      notes: requestDraft.notes.trim() || null,
      createdAt: new Date().toISOString(),
    };

    setMasterDataRequests((prev) => [...prev, payload]);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.master_data_request;
      return next;
    });
    setRequestDraft(null);
  };

  const removeMasterDataRequest = (requestId: string) => {
    setMasterDataRequests((prev) => prev.filter((request) => request.id !== requestId));
  };

  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter") return;

    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName.toLowerCase();
    if (tagName === "textarea" || tagName === "button") return;

    event.preventDefault();
  };

  const handleClientValidation = (event: FormEvent<HTMLFormElement>) => {
    const nextErrors: Record<string, string> = {};
    if (!supplierId) nextErrors["supplier_id"] = "Selecciona un proveedor.";
    if (isDirectReceipt && isExceptionReceipt && !emergencyReason.trim()) {
      nextErrors["emergency_reason"] = "Escribe el motivo de la excepción.";
    }

    const hasAtLeastOneValidLine = lines.some((line) => {
      const qty = Number(line.quantity || 0);
      const factor = Number(line.conversionFactorToStock || 0);
      const hasPresentationSnapshot = isDirectReceipt
        ? Boolean(line.presentationId) && Boolean(line.inputUnitLabel) && factor > 0
        : Boolean(line.purchaseOrderItemId) && Boolean(line.inputUnitLabel) && factor > 0;

      return Boolean(line.productId) && hasPresentationSnapshot && Number.isFinite(qty) && qty > 0;
    });
    if (!hasAtLeastOneValidLine) {
      nextErrors["lines"] = "Agrega al menos un item con producto y cantidad mayor a 0.";
    }

    lines.forEach((line, index) => {
      const qty = Number(line.quantity || 0);
      const factor = Number(line.conversionFactorToStock || 0);
      const hasQty = Number.isFinite(qty) && qty > 0;
      const hasProduct = Boolean(line.productId);
      const shouldValidateLine = hasQty || hasProduct;
      if (!shouldValidateLine) return;

      if (!hasProduct) nextErrors[`line_${index}_productId`] = "Selecciona producto.";
      if (!hasQty) nextErrors[`line_${index}_quantity`] = "Ingresa cantidad válida.";
      if (!line.locationId) nextErrors[`line_${index}_locationId`] = "Selecciona LOC.";
      if (!line.inputUnitLabel.trim() || !Number.isFinite(factor) || factor <= 0) {
        nextErrors[`line_${index}_presentation`] = "Define una presentación válida.";
      }

      if (isDirectReceipt && !line.presentationId) {
        nextErrors[`line_${index}_presentation`] = "Selecciona una presentación manual activa.";
      }

      if (isPurchaseOrderReceipt && !line.purchaseOrderItemId) {
        nextErrors[`line_${index}_presentation`] = "La línea no pertenece a la orden de compra seleccionada.";
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
    <form
      action={action}
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"
      onKeyDown={handleFormKeyDown}
      onSubmit={handleClientValidation}
    >
      <input type="hidden" name="site_id" value={siteId} />
      <input type="hidden" name="supplier_id" value={supplierId} />
      <input type="hidden" name="purchase_order_id" value={selectedPurchaseOrderId} />
      <input type="hidden" name="entry_mode" value={entryMode} />
      <input type="hidden" name="emergency_reason" value={effectiveEmergencyReason} />
      {masterDataRequests.map((request) => (
        <input
          key={request.id}
          type="hidden"
          name="master_data_request_payload"
          value={JSON.stringify(request)}
        />
      ))}

      <div className="space-y-5">
        <section className="rounded-[1.75rem] border border-[var(--ui-border)] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="ui-caption">Tipo de recepción</div>
              <h2 className="mt-1 text-xl font-bold text-[var(--ui-text)]">
                {isPurchaseOrderReceipt ? "Recepción con orden de compra" : "Recepción directa"}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--ui-muted)]">
                {isPurchaseOrderReceipt
                  ? "Carga los insumos pendientes de la OC, confirma cantidades reales y envía cada línea a su LOC y ubicación interna."
                  : "Recibe compras sin OC sin tratarlas como error operativo. Selecciona proveedor, insumos, presentación, costo e inventario destino."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className={isPurchaseOrderReceipt ? "ui-chip ui-chip--success" : "ui-chip ui-chip--info"}>
                {isPurchaseOrderReceipt ? "Con OC" : "Sin OC"}
              </span>
              {isDirectReceipt && isExceptionReceipt ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  Excepción
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-4">
            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className="ui-label">Orden de compra</span>
              {hasPurchaseOrderOptions ? (
                <select
                  className="ui-input"
                  value={selectedPurchaseOrderId}
                  onChange={(e) => onPurchaseOrderChange(e.target.value)}
                >
                  <option value="">Recepción directa sin OC</option>
                  {poOptions.map((po) => (
                    <option key={po.value} value={po.value}>
                      {po.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 text-sm text-[var(--ui-muted)]">
                  No hay órdenes activas para esta sede. Puedes registrar una recepción directa.
                </div>
              )}
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Proveedor</span>
              <select
                className="ui-input"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                required
                disabled={isPurchaseOrderReceipt && Boolean(prefillSupplierId)}
              >
                <option value="">Seleccionar proveedor</option>
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

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Factura / referencia</span>
              <input
                name="invoice_number"
                className="ui-input"
                placeholder="Factura, remisión o referencia del proveedor"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Notas generales</span>
              <input
                name="notes"
                className="ui-input"
                placeholder="Observaciones de recepción"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>

          {isDirectReceipt ? (
            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">Recepción directa sin OC</div>
                  <p className="mt-1">
                    No se bloquea el flujo por no existir OC. El sistema dejará trazabilidad y actualizará costos reales desde la recepción.
                  </p>
                </div>

                <label className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={isExceptionReceipt}
                    onChange={(e) => setIsExceptionReceipt(e.target.checked)}
                  />
                  Marcar como excepción
                </label>
              </div>

              {isExceptionReceipt ? (
                <label className="mt-3 flex flex-col gap-1">
                  <span className="ui-label">Motivo de excepción</span>
                  <input
                    className="ui-input bg-white"
                    placeholder="Ej: compra urgente sin OC por falta de stock"
                    value={emergencyReason}
                    onChange={(e) => setEmergencyReason(e.target.value)}
                  />
                  {fieldErrors["emergency_reason"] ? (
                    <span className="text-xs text-rose-600">{fieldErrors["emergency_reason"]}</span>
                  ) : null}
                </label>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
              <div className="font-semibold">Recepción vinculada a OC</div>
              <p className="mt-1">
                Los productos y presentaciones vienen desde la orden seleccionada. Ajusta cantidad, costo real, impuestos y destino físico.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-[1.75rem] border border-[var(--ui-border)] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[var(--ui-text)]">Insumos recibidos</h3>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                Primero selecciona proveedor; después agrega insumos, presentación, costo, LOC y ubicación interna.
              </p>
            </div>

            {!isPurchaseOrderReceipt ? (
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={addLine}>
                + Agregar insumo
              </button>
            ) : null}
          </div>

          {supplierId && !productsHaveSupplierLinks ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <div className="font-semibold">Catálogo proveedor-producto pendiente de conectar</div>
              <p className="mt-1">
                El catálogo aún no trae asociaciones proveedor-producto suficientes. La recepción permite buscar en el catálogo disponible y deja la solicitud pendiente cuando falta maestro de datos.
              </p>
            </div>
          ) : null}

          {fieldErrors["lines"] ? (
            <p className="mt-4 text-sm text-rose-600">{fieldErrors["lines"]}</p>
          ) : null}

          <div className="mt-4 space-y-4">
            {lines.map((line, index) => {
              const product = line.productId ? productMap.get(line.productId) : undefined;
              const stockUnitCode = line.stockUnitCode || getProductStockUnitCode(product);
              const inputUnitLabel = line.inputUnitLabel || line.inputUnitCode || stockUnitCode;
              const cost = computeLineCost({
                ...line,
                stockUnitCode,
                inputUnitLabel,
                conversionFactorToStock: line.conversionFactorToStock || "1",
              });
              const linePositions = positionsByLocationId.get(line.locationId) ?? [];
              const hasInternalPositions = linePositions.length > 0;
              const productPresentations = getUniquePresentations(product?.presentations);

              return (
                <div key={`line-${index}`} className="rounded-[1.5rem] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-[var(--ui-text)]">
                        Línea {index + 1}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        {product ? shortProductName(product) : "Selecciona un insumo para empezar."}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {product?.lot_tracking ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                          Requiere lote
                        </span>
                      ) : null}
                      {product?.expiry_tracking ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                          Requiere vencimiento
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="ui-btn ui-btn--ghost ui-btn--sm"
                        onClick={() => removeLine(index)}
                        disabled={lines.length <= 1 || isPurchaseOrderReceipt}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(260px,1.4fr)_minmax(260px,1fr)_minmax(260px,1fr)]">
                    <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-[var(--ui-text)]">Insumo</div>
                          <div className="text-xs text-[var(--ui-muted)]">
                            {selectedSupplier
                              ? `Proveedor: ${selectedSupplier.name ?? selectedSupplier.id}`
                              : "Selecciona proveedor para priorizar sus insumos."}
                          </div>
                        </div>
                      </div>

                      {isPurchaseOrderReceipt && product ? (
                        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
                          <div className="font-semibold">{formatProductOptionLabel(product)}</div>
                          <div className="mt-1 text-xs">
                            Línea cargada desde la orden de compra.
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3">
                          <input
                            className="ui-input"
                            placeholder="Buscar insumo por nombre o unidad"
                            value={line.productSearch}
                            autoComplete="off"
                            onFocus={() => setActiveProductPickerIndex(index)}
                            onChange={(e) => {
                              updateLine(index, {
                                productSearch: e.target.value,
                                productId: "",
                                presentationId: "",
                              });
                              setActiveProductPickerIndex(index);
                            }}
                          />

                          {activeProductPickerIndex === index ? (
                            <div className="mt-2 max-h-80 overflow-y-auto rounded-2xl border border-[var(--ui-border)] bg-white p-2 shadow-lg">
                              {visibleProductOptionsByLine[index]?.map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  className="mb-2 w-full rounded-2xl border border-[var(--ui-border)] bg-white p-3 text-left transition hover:border-[var(--ui-brand)] hover:bg-[var(--ui-brand)]/5"
                                  onClick={() => selectProduct(index, option)}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-bold text-[var(--ui-text)]">
                                        {option.name ?? option.id}
                                      </div>
                                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                                        Unidad stock: {getProductStockUnitCode(option)}
                                      </div>
                                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                                        Presentaciones: {(option.presentations ?? []).length || "base"}
                                      </div>
                                    </div>
                                    <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2 py-1 text-[11px] font-semibold text-[var(--ui-muted)]">
                                      Seleccionar
                                    </span>
                                  </div>
                                </button>
                              ))}

                              {!visibleProductOptionsByLine[index]?.length ? (
                                <div className="rounded-2xl border border-dashed border-[var(--ui-border)] p-4 text-sm text-[var(--ui-muted)]">
                                  No encontramos ese insumo. Puedes solicitarlo para revisión de maestro de datos.
                                </div>
                              ) : null}

                              <div className="grid gap-2 pt-2 sm:grid-cols-2">
                                <button
                                  type="button"
                                  className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-left text-xs font-semibold text-[var(--ui-text)] transition hover:border-[var(--ui-brand)] hover:bg-[var(--ui-brand)]/5"
                                  onClick={() => openNewProductRequest(index)}
                                >
                                  Solicitar nuevo insumo
                                  <span className="mt-1 block font-normal text-[var(--ui-muted)]">
                                    Lo revisa maestro de datos antes de quedar en catálogo.
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-left text-xs font-semibold text-[var(--ui-muted)]"
                                  onClick={() => setActiveProductPickerIndex(null)}
                                >
                                  Cerrar buscador
                                  <span className="mt-1 block font-normal text-[var(--ui-muted)]">
                                    Para presentaciones, selecciona primero un insumo.
                                  </span>
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}

                      <input type="hidden" name="item_product_id" value={line.productId} />
                      <input type="hidden" name="item_purchase_order_item_id" value={line.purchaseOrderItemId} />

                      {fieldErrors[`line_${index}_productId`] ? (
                        <p className="mt-2 text-xs text-rose-600">{fieldErrors[`line_${index}_productId`]}</p>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                      <div className="text-sm font-bold text-[var(--ui-text)]">Presentación y cantidad</div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        La cantidad recibida se convierte a unidad stock.
                      </div>

                      <div className="mt-3 grid gap-3">
                        {!isPurchaseOrderReceipt && product && productPresentations.length === 0 ? (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                            Este insumo no tiene presentaciones manuales activas. Solicita una nueva presentación
                            para revisión de maestro de datos antes de registrarlo.
                          </div>
                        ) : null}

                        {productPresentations.length > 0 && !isPurchaseOrderReceipt ? (
                          <label>
                            <span className="ui-label">Presentación existente</span>
                            <select
                              className="ui-input mt-1"
                              value={line.presentationId}
                              onChange={(e) => {
                                const presentation = productPresentations.find((row) => row.id === e.target.value);
                                if (!presentation) {
                                  updateLine(index, {
                                    presentationId: "",
                                    inputUnitCode: "",
                                    inputUnitLabel: "",
                                    conversionFactorToStock: "1",
                                  });
                                  return;
                                }

                                const presentationFactor = Number(presentation.qty_in_stock_unit || 1);
                                const suggestedUnitCost = getPresentationSuggestedUnitCost(product, presentation, presentationFactor);

                                updateLine(index, {
                                  presentationId: presentation.id,
                                  inputUnitCode: presentation.input_unit_code,
                                  inputUnitLabel: presentation.label,
                                  conversionFactorToStock: String(presentationFactor || 1),
                                  unitCost: line.unitCost || formatUnitCostForInput(suggestedUnitCost),
                                });
                              }}
                            >
                              <option value="">Seleccionar presentación manual</option>
                              {productPresentations.map((presentation) => (
                                <option key={presentation.id} value={presentation.id}>
                                  {presentation.label} · 1 = {formatQty(Number(presentation.qty_in_stock_unit ?? 0))} {stockUnitCode}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="flex flex-col">
                            <span className="ui-label min-h-[32px]">Presentación recibida</span>
                            <input
                              className="ui-input mt-1"
                              placeholder="Ej: Caja x 12"
                              value={inputUnitLabel}
                              disabled
                              onChange={(e) => updateManualPresentation(index, e.target.value)}
                            />
                          </label>

                          <label className="flex flex-col">
                            <span className="ui-label min-h-[32px]">Factor a stock</span>
                            <input
                              className="ui-input mt-1"
                              type="number"
                              step="0.000001"
                              min="0.000001"
                              value={line.conversionFactorToStock}
                              disabled
                              onChange={(e) => updateLine(index, { conversionFactorToStock: e.target.value })}
                            />
                          </label>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="flex flex-col">
                            <span className="ui-label min-h-[32px]">Cantidad recibida</span>
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

                          <div className="flex min-h-[78px] flex-col justify-center rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-xs text-[var(--ui-muted)]">
                            <div className="font-semibold text-[var(--ui-text)]">Conversión</div>
                            <div className="mt-1">
                              {cost.inputQty > 0
                                ? `${formatQty(cost.inputQty)} ${inputUnitLabel} = ${formatQty(cost.stockQty)} ${stockUnitCode}`
                                : `Cantidad en ${inputUnitLabel || stockUnitCode}.`}
                            </div>
                          </div>
                        </div>

                        {!isPurchaseOrderReceipt ? (
                          <button
                            type="button"
                            className="w-full rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-left text-xs font-semibold text-[var(--ui-text)] transition hover:border-[var(--ui-brand)] hover:bg-[var(--ui-brand)]/5 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => openNewPresentationRequest(index)}
                            disabled={!line.productId}
                          >
                            Solicitar nueva presentación
                            <span className="mt-1 block font-normal text-[var(--ui-muted)]">
                              Ej: el producto era botella 1 L, pero llegó botella 2 L.
                            </span>
                          </button>
                        ) : null}
                      </div>

                      <input type="hidden" name="item_presentation_id" value={line.presentationId} />
                      <input type="hidden" name="item_input_unit_code" value={line.inputUnitCode || normalizeUnitCode(inputUnitLabel) || stockUnitCode} />
                      <input type="hidden" name="item_input_unit_label" value={inputUnitLabel} />
                      <input type="hidden" name="item_conversion_factor_to_stock" value={String(cost.conversionFactorToStock || 1)} />
                      <input type="hidden" name="item_stock_unit_code" value={stockUnitCode} />

                      {fieldErrors[`line_${index}_quantity`] ? (
                        <p className="mt-2 text-xs text-rose-600">{fieldErrors[`line_${index}_quantity`]}</p>
                      ) : null}
                      {fieldErrors[`line_${index}_presentation`] ? (
                        <p className="mt-2 text-xs text-rose-600">{fieldErrors[`line_${index}_presentation`]}</p>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                      <div className="text-sm font-bold text-[var(--ui-text)]">Costo e impuestos</div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        El costo de inventario se calcula con neto sin impuesto.
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="sm:col-span-2">
                          <span className="ui-label">Precio digitado</span>
                          <input
                            className="ui-input mt-1"
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.unitCost}
                            onChange={(e) => updateLine(index, { unitCost: e.target.value })}
                          />
                        </label>

                        <label>
                          <span className="ui-label">Tipo de precio</span>
                          <select
                            className="ui-input mt-1"
                            value={line.costInputMode}
                            onChange={(e) => updateLine(index, { costInputMode: e.target.value === "gross" ? "gross" : "net" })}
                          >
                            <option value="net">Sin impuesto</option>
                            <option value="gross">Con impuesto incluido</option>
                          </select>
                        </label>

                        <label>
                          <span className="ui-label">IVA / impuesto %</span>
                          <input
                            className="ui-input mt-1"
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.taxRate}
                            onChange={(e) => updateLine(index, { taxRate: e.target.value })}
                          />
                        </label>
                      </div>

                      <div className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-xs">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <span className="text-[var(--ui-muted)]">Neto presentación</span>
                            <div className="font-bold text-[var(--ui-text)]">{formatAmount(cost.netUnitCost)}</div>
                          </div>
                          <div>
                            <span className="text-[var(--ui-muted)]">Bruto presentación</span>
                            <div className="font-bold text-[var(--ui-text)]">{formatAmount(cost.grossUnitCost)}</div>
                          </div>
                          <div>
                            <span className="text-[var(--ui-muted)]">Costo stock</span>
                            <div className="font-bold text-[var(--ui-text)]">{formatAmount(cost.stockUnitCost)} / {stockUnitCode}</div>
                          </div>
                          <div>
                            <span className="text-[var(--ui-muted)]">Total línea</span>
                            <div className="font-bold text-[var(--ui-text)]">{formatAmount(cost.grossTotal)}</div>
                          </div>
                        </div>
                      </div>

                      <input type="hidden" name="item_unit_cost" value={cost.netUnitCost > 0 ? String(Math.round(cost.netUnitCost * 1000000) / 1000000) : ""} />
                      <input type="hidden" name="item_cost_input_mode" value={line.costInputMode} />
                      <input type="hidden" name="item_tax_included" value={cost.taxIncluded ? "true" : "false"} />
                      <input type="hidden" name="item_tax_rate" value={String(cost.taxRate)} />
                      <input type="hidden" name="item_net_unit_cost" value={String(cost.netUnitCost)} />
                      <input type="hidden" name="item_gross_unit_cost" value={String(cost.grossUnitCost)} />
                      <input type="hidden" name="item_net_total_cost" value={String(cost.netTotal)} />
                      <input type="hidden" name="item_gross_total_cost" value={String(cost.grossTotal)} />
                      <input type="hidden" name="item_tax_amount" value={String(cost.taxAmount)} />
                    </div>
                  </div>

                  {requestDraft?.lineIndex === index ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-bold">Solicitud de maestro de datos</div>
                          <p className="mt-1 text-xs leading-5">
                            {requestDraft.kind === "new_product"
                              ? "Solicita un insumo nuevo para revisión. No se crea directo en catálogo desde recepción."
                              : "Solicita una presentación nueva para el producto seleccionado. No se aprueba directo desde bodega."}
                          </p>
                        </div>
                        <span className="rounded-full border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold">
                          {getRequestKindLabel(requestDraft.kind)}
                        </span>
                      </div>

                      {requestDraft.kind === "new_presentation" && product ? (
                        <div className="mt-3 rounded-2xl border border-amber-200 bg-white px-3 py-2 text-xs">
                          Producto: <span className="font-semibold">{formatProductOptionLabel(product)}</span> · Unidad stock: {stockUnitCode}
                        </div>
                      ) : null}

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="ui-label">
                            {requestDraft.kind === "new_product" ? "Nombre propuesto del insumo" : "Nombre de la presentación"}
                          </span>
                          <input
                            className="ui-input bg-white"
                            placeholder={requestDraft.kind === "new_product" ? "Ej: Vinagre de arroz" : "Ej: Botella 2 L"}
                            value={requestDraft.requestedLabel}
                            onChange={(e) => {
                              const value = e.target.value;
                              updateRequestDraft({
                                requestedLabel: value,
                                inputUnitLabel: requestDraft.kind === "new_presentation" ? value : requestDraft.inputUnitLabel,
                              });
                            }}
                          />
                        </label>

                        {requestDraft.kind === "new_product" ? (
                          <label className="flex flex-col gap-1">
                            <span className="ui-label">Unidad stock propuesta</span>
                            <input
                              className="ui-input bg-white"
                              placeholder="Ej: un, g, kg, ml, l"
                              value={requestDraft.stockUnitCode}
                              onChange={(e) => updateRequestDraft({ stockUnitCode: normalizeUnitCode(e.target.value) || e.target.value })}
                            />
                          </label>
                        ) : (
                          <>
                            <label className="flex flex-col gap-1">
                              <span className="ui-label">Unidad de entrada</span>
                              <input
                                className="ui-input bg-white"
                                placeholder="Ej: botella, bolsa, caja"
                                value={requestDraft.inputUnitLabel}
                                onChange={(e) => updateRequestDraft({ inputUnitLabel: e.target.value })}
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="ui-label">Factor a stock</span>
                              <input
                                className="ui-input bg-white"
                                type="number"
                                step="0.000001"
                                min="0.000001"
                                value={requestDraft.conversionFactorToStock}
                                onChange={(e) => updateRequestDraft({ conversionFactorToStock: e.target.value })}
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="ui-label">Costo neto sugerido</span>
                              <input
                                className="ui-input bg-white"
                                type="number"
                                step="0.01"
                                min="0"
                                value={requestDraft.unitCost}
                                onChange={(e) => updateRequestDraft({ unitCost: e.target.value })}
                              />
                            </label>
                          </>
                        )}

                        <label className="flex flex-col gap-1 md:col-span-2">
                          <span className="ui-label">Notas para revisión</span>
                          <textarea
                            className="ui-input min-h-20 bg-white"
                            placeholder="Ej: proveedor envió presentación diferente a la habitual."
                            value={requestDraft.notes}
                            onChange={(e) => updateRequestDraft({ notes: e.target.value })}
                          />
                        </label>
                      </div>

                      {fieldErrors.master_data_request ? (
                        <p className="mt-2 text-xs text-rose-700">{fieldErrors.master_data_request}</p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="ui-btn ui-btn--brand ui-btn--sm" onClick={saveRequestDraft}>
                          Agregar solicitud pendiente
                        </button>
                        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setRequestDraft(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 lg:grid-cols-4">
                    <label>
                      <span className="ui-label">LOC / destino operativo</span>
                      <select
                        name="item_location_id"
                        className="ui-input mt-1"
                        value={line.locationId}
                        onChange={(e) => updateLine(index, { locationId: e.target.value, positionId: "" })}
                      >
                        <option value="">Seleccionar LOC</option>
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

                    {hasInternalPositions ? (
                      <label className="lg:col-span-2">
                        <span className="ui-label">Ubicación interna</span>
                        <select
                          name="item_location_position_id"
                          className="ui-input mt-1"
                          value={line.positionId}
                          onChange={(e) => updateLine(index, { positionId: e.target.value })}
                        >
                          <option value="">Sin ubicación interna</option>
                          {buildPositionTreeOptions(linePositions, positionById).map(({ position, label }) => (
                            <option key={position.id} value={position.id}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-[var(--ui-muted)]">
                          Usa la misma estructura de Conteo: estantería → nivel → bin.
                        </p>
                      </label>
                    ) : (
                      <div className="lg:col-span-2 rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3 text-xs text-[var(--ui-muted)]">
                        Este LOC no tiene ubicaciones internas configuradas.
                        <input type="hidden" name="item_location_position_id" value="" />
                      </div>
                    )}

                    <label>
                      <span className="ui-label">Notas línea</span>
                      <input
                        name="item_notes"
                        className="ui-input mt-1"
                        placeholder="Opcional"
                        value={line.notes}
                        onChange={(e) => updateLine(index, { notes: e.target.value })}
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label>
                      <span className="ui-label">Lote</span>
                      <input
                        name="item_lot_number"
                        className="ui-input mt-1"
                        placeholder={product?.lot_tracking ? "Obligatorio" : "Opcional"}
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
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="xl:sticky xl:top-28 xl:max-h-[calc(100vh-8rem)] xl:self-start xl:overflow-y-auto">
        <div className="rounded-[1.75rem] border border-[var(--ui-border)] bg-white p-5 shadow-sm">
          <div className="text-lg font-bold text-[var(--ui-text)]">Resumen de recepción</div>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Verifica proveedor, líneas, impuestos y costo de inventario antes de registrar.
          </p>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Proveedor</div>
              <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">
                {selectedSupplier?.name ?? "Sin seleccionar"}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Líneas</div>
                <div className="mt-1 text-2xl font-bold text-[var(--ui-text)]">{receiptTotals.validLines}</div>
              </div>
              <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Stock</div>
                <div className="mt-1 text-sm font-bold text-[var(--ui-text)]">{formatQty(receiptTotals.stockQty)}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--ui-muted)]">Total neto</span>
                <span className="font-bold text-[var(--ui-text)]">{formatAmount(receiptTotals.netTotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-[var(--ui-muted)]">Impuestos</span>
                <span className="font-bold text-[var(--ui-text)]">{formatAmount(receiptTotals.taxAmount)}</span>
              </div>
              <div className="mt-2 border-t border-[var(--ui-border)] pt-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-[var(--ui-text)]">Total factura</span>
                <span className="font-bold text-[var(--ui-text)]">{formatAmount(receiptTotals.grossTotal)}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950">
              El costo promedio operativo se calcula con el valor neto. El bruto queda disponible para trazabilidad de factura.
            </div>

            {masterDataRequests.length > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                <div className="font-bold">Solicitudes para revisión</div>
                <div className="mt-2 space-y-2">
                  {masterDataRequests.map((request) => (
                    <div key={request.id} className="rounded-xl border border-amber-200 bg-white p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">{getRequestKindLabel(request.kind)}</div>
                          <div className="mt-1 text-[var(--ui-muted)]">
                            {request.productName ? `${request.productName} · ` : ""}{request.requestedLabel}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-rose-700"
                          onClick={() => removeMasterDataRequest(request.id)}
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {serverErrorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {serverErrorMessage}
              </div>
            ) : null}

            <button type="submit" className="ui-btn ui-btn--brand w-full">
              Registrar recepción
            </button>

            <button
              type="button"
              className="ui-btn ui-btn--ghost w-full"
              onClick={() => {
                window.sessionStorage.removeItem(storageKey);
                setLines([makeEmptyLine(defaultLocationId)]);
                setInvoiceNumber("");
                setNotes("");
                setReceivedAt("");
                setEmergencyReason("");
                setIsExceptionReceipt(false);
                setMasterDataRequests([]);
                setRequestDraft(null);
              }}
            >
              Limpiar borrador
            </button>
          </div>
        </div>
      </aside>
    </form>
  );
}
