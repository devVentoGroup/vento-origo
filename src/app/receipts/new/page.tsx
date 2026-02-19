import { redirect } from "next/navigation";

export default async function NewReceiptRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<{ purchase_order_id?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const purchaseOrderId = String(sp.purchase_order_id ?? "").trim();
  if (purchaseOrderId) {
    redirect(`/receipts?purchase_order_id=${encodeURIComponent(purchaseOrderId)}`);
  }
  redirect("/receipts");
}
