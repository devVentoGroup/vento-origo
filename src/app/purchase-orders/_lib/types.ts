export type PurchaseOrderStatus = "draft" | "sent" | "received";

export type PurchaseOrderRow = {
  id: string;
  supplier_id: string;
  site_id: string;
  status: string;
  created_at: string;
  expected_at: string | null;
  received_at: string | null;
  total_amount: number | null;
  currency: string;
  notes: string | null;
  cost_center_id: string | null;
  approved_by: string | null;
  approval_date: string | null;
  created_by: string | null;
};

export type PurchaseOrderItemRow = {
  id: string;
  purchase_order_id: string;
  product_id: string;
  quantity_ordered: number;
  quantity_received: number | null;
  unit_cost: number;
  line_total: number | null;
  unit: string | null;
  input_unit_label?: string | null;
  stock_quantity_ordered?: number | null;
  stock_unit_code?: string | null;
  created_at: string;
};

export type PurchaseOrderWithRelations = PurchaseOrderRow & {
  suppliers?: { id: string; name: string } | null;
  sites?: { id: string; name: string } | null;
};

export type PurchaseOrderItemWithProduct = PurchaseOrderItemRow & {
  products?: { id: string; name: string; sku: string | null } | null;
};
