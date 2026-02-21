import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { buildPurchaseOrderPdf } from "@/lib/purchase-orders/pdf";
import { formatPurchaseOrderRef } from "@/lib/purchase-orders/reference";
import { verifyPurchaseOrderPdfToken } from "@/lib/purchase-orders/public-pdf-token";
import { createClient } from "@/lib/supabase/server";
import { normalizeQuantityToBase, normalizeUnitCostToBase } from "@/lib/units/normalize";

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

async function loadBrandLogoPngBytes(): Promise<Uint8Array | null> {
  const envPath = String(process.env.ORIGO_PO_BRAND_LOGO_PATH ?? "").trim();
  const candidates = [
    envPath,
    "public/logos/vento-group.png",
    "public/logos/vento-group.PNG",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const absolute = path.isAbsolute(candidate)
      ? candidate
      : path.join(process.cwd(), candidate.replace(/^[/\\]+/, ""));
    try {
      const file = await readFile(absolute);
      return new Uint8Array(file);
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  received: "Recibida",
  cancelled: "Cancelada",
};

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const requestUrl = new URL(req.url);
  const token = requestUrl.searchParams.get("t") ?? "";
  const hasValidToken = verifyPurchaseOrderPdfToken(id, token);
  const supabase = await createClient();

  if (!hasValidToken) {
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
  const orderRef = formatPurchaseOrderRef({ id: po.id, createdAt: po.created_at });

  const currencyCode = String(po.currency ?? "COP");
  const totalLabel = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: currencyCode,
  }).format(Number(po.total_amount ?? 0));

  const itemRows = (items ?? []).map((row) => {
    const product = row.products as { name?: string | null; sku?: string | null } | null;
    const productLabel = product
      ? `${product.sku ? `${product.sku} - ` : ""}${product.name ?? ""}`
      : "Producto";
    const opQty = Number(row.quantity_ordered ?? 0);
    const opCost = Number(row.unit_cost ?? 0);
    const unitCode = String(row.unit ?? "u");
    const normalizedQty = normalizeQuantityToBase({ quantity: opQty, unit: unitCode });
    const normalizedCost = normalizeUnitCostToBase({ unitCost: opCost, unit: unitCode });
    const moneyFmt = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: currencyCode,
    });
    const qtyFmt = new Intl.NumberFormat("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    });

    return {
      productLabel,
      quantityOperational: `${qtyFmt.format(opQty)} ${unitCode}`.trim(),
      quantityBase: `${qtyFmt.format(normalizedQty.baseQuantity)} ${normalizedQty.baseUnit}`.trim(),
      unitCostOperational: `${moneyFmt.format(opCost)} / ${unitCode}`.trim(),
      unitCostBase: `${moneyFmt.format(normalizedCost.baseUnitCost)} / ${normalizedQty.baseUnit}`.trim(),
      lineTotal: moneyFmt.format(Number(row.line_total ?? opQty * opCost)),
    };
  });
  const logoPngBytes = await loadBrandLogoPngBytes();

  const brandPrimary = process.env.ORIGO_PO_BRAND_PRIMARY ?? "#46CDA0";

  const brand = {
    businessName: process.env.ORIGO_PO_BRAND_NAME ?? "Vento Group",
    documentTitle: process.env.ORIGO_PO_BRAND_TITLE ?? "Orden de compra",
    logoText: process.env.ORIGO_PO_BRAND_LOGO_TEXT ?? "VG",
    logoPngBytes,
    primaryColor: brandPrimary,
    waveColor: process.env.ORIGO_PO_BRAND_WAVE ?? "#059669",
    headerColor: process.env.ORIGO_PO_BRAND_HEADER ?? brandPrimary,
    softColor: process.env.ORIGO_PO_BRAND_SURFACE ?? "#ECFFF7",
    textColor: process.env.ORIGO_PO_BRAND_TEXT ?? "#0B2A1F",
    mutedColor: process.env.ORIGO_PO_BRAND_MUTED ?? "#64748B",
    footerText:
      process.env.ORIGO_PO_BRAND_FOOTER ??
      "Documento generado por ORIGO - Vento Group",
  };

  const bytes = buildPurchaseOrderPdf({
    orderRef,
    statusLabel: STATUS_LABELS[String(po.status ?? "")] ?? String(po.status ?? "-"),
    supplierName,
    siteName,
    createdAtLabel: po.created_at ? new Date(po.created_at).toLocaleString("es-CO") : "-",
    expectedAtLabel: po.expected_at ? new Date(po.expected_at).toLocaleDateString("es-CO") : "-",
    totalLabel,
    notes: po.notes ? String(po.notes) : null,
    items: itemRows,
    brand,
  });
  const bodyBytes = new Uint8Array(bytes.length);
  bodyBytes.set(bytes);
  const body = new Blob([bodyBytes], { type: "application/pdf" });

  const filename = `${sanitizeFilename(orderRef)}.pdf`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=\"${filename}\"`,
      "Cache-Control": "private, no-store",
    },
  });
}
