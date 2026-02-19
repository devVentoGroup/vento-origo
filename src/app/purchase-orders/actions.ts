"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function parseNum(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(typeof v === "string" ? v.trim() : v);
  return Number.isFinite(n) ? n : null;
}

export async function createPurchaseOrder(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) redirect("/login");

  const supplierId = (formData.get("supplier_id") as string)?.trim();
  const siteId = (formData.get("site_id") as string)?.trim();
  if (!supplierId || !siteId) {
    redirect("/purchase-orders/new?error=supplier_site_required");
  }

  const expectedAt = (formData.get("expected_at") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      supplier_id: supplierId,
      site_id: siteId,
      status: "draft",
      expected_at: expectedAt || null,
      notes: notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (poError || !po) {
    redirect(`/purchase-orders/new?error=${encodeURIComponent(poError?.message ?? "Error al crear")}`);
  }

  const productIds = formData.getAll("item_product_id").map((v) => String(v).trim());
  const qtys = formData.getAll("item_quantity").map((v) => parseNum(v));
  const costs = formData.getAll("item_unit_cost").map((v) => parseNum(v) ?? 0);
  const units = formData.getAll("item_unit").map((v) => String(v).trim() || null);

  const items: { product_id: string; quantity_ordered: number; unit_cost: number; unit: string | null }[] = [];
  for (let i = 0; i < productIds.length; i += 1) {
    const productId = productIds[i];
    const qty = qtys[i];
    if (!productId || qty == null || qty <= 0) continue;
    items.push({
      product_id: productId,
      quantity_ordered: qty,
      unit_cost: costs[i] ?? 0,
      unit: units[i] ?? null,
    });
  }

  if (items.length) {
    const rows = items.map((it) => ({
      purchase_order_id: po.id,
      product_id: it.product_id,
      quantity_ordered: it.quantity_ordered,
      unit_cost: it.unit_cost,
      unit: it.unit,
      line_total: it.quantity_ordered * it.unit_cost,
    }));
    const { error: itemsError } = await supabase.from("purchase_order_items").insert(rows);
    if (itemsError) {
      redirect(`/purchase-orders/new?error=${encodeURIComponent(itemsError.message)}`);
    }
  }

  const { data: sumRow } = await supabase
    .from("purchase_order_items")
    .select("line_total")
    .eq("purchase_order_id", po.id);
  const total = (sumRow ?? []).reduce((s, r) => s + Number(r.line_total ?? 0), 0);
  await supabase.from("purchase_orders").update({ total_amount: total }).eq("id", po.id);

  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders/${po.id}`);
}

export async function setPurchaseOrderSent(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "sent" })
    .eq("id", id)
    .eq("status", "draft");

  if (error) {
    redirect(`/purchase-orders/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  redirect(`/purchase-orders/${id}`);
}

export async function updatePurchaseOrder(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: poRow } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", id)
    .single();
  if (poRow?.status !== "draft") {
    redirect(`/purchase-orders/${id}?error=only_draft_editable`);
  }

  const supplierId = (formData.get("supplier_id") as string)?.trim();
  const siteId = (formData.get("site_id") as string)?.trim();
  if (!supplierId || !siteId) {
    redirect(`/purchase-orders/${id}/edit?error=supplier_site_required`);
  }

  const expectedAt = (formData.get("expected_at") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  await supabase
    .from("purchase_orders")
    .update({
      supplier_id: supplierId,
      site_id: siteId,
      expected_at: expectedAt || null,
      notes: notes || null,
    })
    .eq("id", id);

  const productIds = formData.getAll("item_product_id").map((v) => String(v).trim());
  const qtys = formData.getAll("item_quantity").map((v) => parseNum(v));
  const costs = formData.getAll("item_unit_cost").map((v) => parseNum(v) ?? 0);
  const units = formData.getAll("item_unit").map((v) => String(v).trim() || null);

  const items: { product_id: string; quantity_ordered: number; unit_cost: number; unit: string | null }[] = [];
  for (let i = 0; i < productIds.length; i += 1) {
    const productId = productIds[i];
    const qty = qtys[i];
    if (!productId || qty == null || qty <= 0) continue;
    items.push({
      product_id: productId,
      quantity_ordered: qty,
      unit_cost: costs[i] ?? 0,
      unit: units[i] ?? null,
    });
  }

  await supabase.from("purchase_order_items").delete().eq("purchase_order_id", id);
  if (items.length) {
    const rows = items.map((it) => ({
      purchase_order_id: id,
      product_id: it.product_id,
      quantity_ordered: it.quantity_ordered,
      unit_cost: it.unit_cost,
      unit: it.unit,
      line_total: it.quantity_ordered * it.unit_cost,
    }));
    await supabase.from("purchase_order_items").insert(rows);
  }

  const { data: sumRow } = await supabase
    .from("purchase_order_items")
    .select("line_total")
    .eq("purchase_order_id", id);
  const total = (sumRow ?? []).reduce((s, r) => s + Number(r.line_total ?? 0), 0);
  await supabase.from("purchase_orders").update({ total_amount: total }).eq("id", id);

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  redirect(`/purchase-orders/${id}`);
}
