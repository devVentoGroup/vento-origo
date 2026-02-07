"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function createSupplier(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/suppliers/new?error=name_required");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({
    name,
    tax_id: formData.get("tax_id") ? String(formData.get("tax_id")).trim() || null : null,
    contact_name:
      formData.get("contact_name") ? String(formData.get("contact_name")).trim() || null : null,
    phone: formData.get("phone") ? String(formData.get("phone")).trim() || null : null,
    email: formData.get("email") ? String(formData.get("email")).trim() || null : null,
    address: formData.get("address") ? String(formData.get("address")).trim() || null : null,
    notes: formData.get("notes") ? String(formData.get("notes")).trim() || null : null,
    is_active: formData.getAll("is_active").includes("true"),
  });

  if (error) {
    redirect(`/suppliers/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/suppliers");
  redirect("/suppliers");
}

export async function updateSupplier(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`/suppliers/${id}/edit?error=name_required`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      name,
      tax_id: formData.get("tax_id") ? String(formData.get("tax_id")).trim() || null : null,
      contact_name:
        formData.get("contact_name") ? String(formData.get("contact_name")).trim() || null : null,
      phone: formData.get("phone") ? String(formData.get("phone")).trim() || null : null,
      email: formData.get("email") ? String(formData.get("email")).trim() || null : null,
      address: formData.get("address") ? String(formData.get("address")).trim() || null : null,
      notes: formData.get("notes") ? String(formData.get("notes")).trim() || null : null,
      is_active: formData.getAll("is_active").includes("true"),
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
