"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCanManageSuppliers } from "@/lib/suppliers";
import { createClient } from "@/lib/supabase/server";

type SupplierPaymentType = "cash" | "credit";

function optionalText(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

function getSupplierPaymentTerms(formData: FormData): {
  payment_type: SupplierPaymentType;
  credit_days: number | null;
} {
  const rawPaymentType = String(formData.get("payment_type") ?? "cash").trim();
  const paymentType: SupplierPaymentType = rawPaymentType === "credit" ? "credit" : "cash";

  const rawCreditDays = String(formData.get("credit_days") ?? "").trim();
  const parsedCreditDays = Number.parseInt(rawCreditDays, 10);
  const creditDays =
    paymentType === "credit" && Number.isFinite(parsedCreditDays) && parsedCreditDays > 0
      ? parsedCreditDays
      : null;

  return {
    payment_type: paymentType,
    credit_days: creditDays,
  };
}

export async function createSupplier(formData: FormData) {
  const supabase = await createClient();
  const { data: authRes } = await supabase.auth.getUser();
  const user = authRes.user ?? null;
  if (!user) {
    redirect("/login");
  }
  await requireCanManageSuppliers(supabase, user.id);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/suppliers/new?error=name_required");
  }

  const paymentTerms = getSupplierPaymentTerms(formData);

  const { error } = await supabase.from("suppliers").insert({
    name,
    tax_id: optionalText(formData, "tax_id"),
    contact_name: optionalText(formData, "contact_name"),
    phone: optionalText(formData, "phone"),
    email: optionalText(formData, "email"),
    address: optionalText(formData, "address"),
    notes: optionalText(formData, "notes"),
    is_active: formData.getAll("is_active").includes("true"),
    payment_type: paymentTerms.payment_type,
    credit_days: paymentTerms.credit_days,
  });

  if (error) {
    redirect(`/suppliers/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/suppliers");
  redirect("/suppliers");
}

export async function updateSupplier(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: authRes } = await supabase.auth.getUser();
  const user = authRes.user ?? null;
  if (!user) {
    redirect("/login");
  }
  await requireCanManageSuppliers(supabase, user.id);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`/suppliers/${id}/edit?error=name_required`);
  }

  const paymentTerms = getSupplierPaymentTerms(formData);

  const { error } = await supabase
    .from("suppliers")
    .update({
      name,
      tax_id: optionalText(formData, "tax_id"),
      contact_name: optionalText(formData, "contact_name"),
      phone: optionalText(formData, "phone"),
      email: optionalText(formData, "email"),
      address: optionalText(formData, "address"),
      notes: optionalText(formData, "notes"),
      is_active: formData.getAll("is_active").includes("true"),
      payment_type: paymentTerms.payment_type,
      credit_days: paymentTerms.credit_days,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/suppliers/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}/edit`);
  redirect("/suppliers");
}

export async function deleteSupplier(formData: FormData) {
  const supplierId = String(formData.get("supplier_id") ?? "").trim();
  if (!supplierId) {
    redirect("/suppliers?error=invalid_supplier");
  }

  const supabase = await createClient();
  const { data: authRes } = await supabase.auth.getUser();
  const user = authRes.user ?? null;
  if (!user) {
    redirect("/login");
  }
  await requireCanManageSuppliers(supabase, user.id);

  const { count: linkedOrders, error: linkedOrdersError } = await supabase
    .from("purchase_orders")
    .select("id", { head: true, count: "exact" })
    .eq("supplier_id", supplierId);

  if (linkedOrdersError) {
    redirect(`/suppliers?error=${encodeURIComponent(linkedOrdersError.message)}`);
  }

  if ((linkedOrders ?? 0) > 0) {
    redirect("/suppliers?error=supplier_has_orders");
  }

  const { error } = await supabase.from("suppliers").delete().eq("id", supplierId);
  if (error) {
    redirect(`/suppliers?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/suppliers");
  redirect("/suppliers?ok=supplier_deleted");
}
