import { NextResponse } from "next/server";

import { buildPurchaseOrderPdf } from "@/lib/purchase-orders/pdf";
import { createClient } from "@/lib/supabase/server";

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: canAccess, error: accessErr } = await supabase.rpc("has_permission", {
    p_permission_code: "origo.access",
  });
  if (accessErr || !canAccess) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select(
      "id,status,created_at,expected_at,total_amount,currency,notes,suppliers(name),sites(name)"
    )
    .eq("id", id)
    .single();

  if (poErr || !po) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { data: items, error: itemsErr } = await supabase
    .from("purchase_order_items")
    .select("quantity_ordered,quantity_received,unit_cost,line_total,unit,products(name,sku)")
    .eq("purchase_order_id", id)
    .order("created_at", { ascending: true });

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  const supplierName = (po.suppliers as { name?: string } | null)?.name ?? "-";
  const siteName = (po.sites as { name?: string } | null)?.name ?? "-";

  const lines: string[] = [
    `Orden: ${po.id}`,
    `Estado: ${String(po.status ?? "-")}`,
    `Proveedor: ${supplierName}`,
    `Sede: ${siteName}`,
    `Creada: ${po.created_at ? new Date(po.created_at).toLocaleString("es-CO") : "-"}`,
    `Esperada: ${po.expected_at ? new Date(po.expected_at).toLocaleDateString("es-CO") : "-"}`,
    `Total: ${new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: String(po.currency ?? "COP"),
    }).format(Number(po.total_amount ?? 0))}`,
    "",
    "Lineas",
  ];

  for (const row of items ?? []) {
    const product = row.products as { name?: string | null; sku?: string | null } | null;
    const productLabel = product
      ? `${product.sku ? `${product.sku} - ` : ""}${product.name ?? ""}`
      : "Producto";

    lines.push(
      `- ${productLabel} | Qty: ${Number(row.quantity_ordered ?? 0)} ${row.unit ?? ""} | Rec: ${Number(
        row.quantity_received ?? 0
      )} | Unit: ${new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
      }).format(Number(row.unit_cost ?? 0))} | Total: ${new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
      }).format(Number(row.line_total ?? 0))}`
    );
  }

  if (po.notes) {
    lines.push("", `Notas: ${String(po.notes)}`);
  }

  const bytes = buildPurchaseOrderPdf({
    title: "Orden de compra",
    lines,
  });
  const bodyBytes = new Uint8Array(bytes.length);
  bodyBytes.set(bytes);
  const body = new Blob([bodyBytes], { type: "application/pdf" });

  const filename = `OC-${sanitizeFilename(String(po.id))}.pdf`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=\"${filename}\"`,
      "Cache-Control": "private, no-store",
    },
  });
}
