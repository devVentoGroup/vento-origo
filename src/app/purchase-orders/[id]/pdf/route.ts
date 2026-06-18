import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";

import { buildPurchaseOrderPdf } from "@/lib/purchase-orders/pdf";
import { formatPurchaseOrderRef } from "@/lib/purchase-orders/reference";
import { verifyPurchaseOrderPdfToken } from "@/lib/purchase-orders/public-pdf-token";
import { createClient } from "@/lib/supabase/server";
import { normalizeQuantityToBase, normalizeUnitCostToBase } from "@/lib/units/normalize";

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL for public purchase order PDF.");
  }

  return createSupabaseServiceClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
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

const STATUS_SUPPLIER_LABELS: Record<string, string> = {
  draft: "Solicitud en preparacion",
  sent: "Solicitud enviada",
  received: "Solicitud recibida",
  cancelled: "Solicitud cancelada",
};

type SupplierPdfItem = {
  productLabel: string;
  quantityLabel: string;
};

type SupplierPurchaseOrderPdfInput = {
  orderRef: string;
  statusLabel: string;
  supplierName: string;
  siteName: string;
  createdAtLabel: string;
  expectedAtLabel: string;
  notes: string | null;
  items: SupplierPdfItem[];
  brand: {
    businessName: string;
    documentTitle: string;
    primaryColor: string;
    softColor: string;
    textColor: string;
    mutedColor: string;
    footerText: string;
  };
};

type Rgb = [number, number, number];

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const PAGE_MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const PAGE_BOTTOM_LIMIT = PAGE_HEIGHT - PAGE_MARGIN;

function sanitizePdfText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value: string): string {
  return sanitizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function parseHexColor(value: string | undefined, fallback: Rgb): Rgb {
  const v = String(value ?? "").trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return fallback;

  if (v.length === 4) {
    return [
      Number.parseInt(v[1] + v[1], 16),
      Number.parseInt(v[2] + v[2], 16),
      Number.parseInt(v[3] + v[3], 16),
    ];
  }

  return [
    Number.parseInt(v.slice(1, 3), 16),
    Number.parseInt(v.slice(3, 5), 16),
    Number.parseInt(v.slice(5, 7), 16),
  ];
}

function rgbToPdf(color: Rgb): string {
  return `${(color[0] / 255).toFixed(3)} ${(color[1] / 255).toFixed(3)} ${(color[2] / 255).toFixed(3)}`;
}

function approxTextWidth(text: string, size: number, bold = false): number {
  return sanitizePdfText(text).length * size * (bold ? 0.54 : 0.52);
}

function wrapText(text: string, maxWidth: number, size: number, bold = false): string[] {
  const clean = sanitizePdfText(text);
  if (!clean) return [""];

  const words = clean.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (approxTextWidth(next, size, bold) <= maxWidth) {
      line = next;
      continue;
    }

    if (line) lines.push(line);
    line = word;
  }

  if (line) lines.push(line);
  return lines.length ? lines : [clean];
}

function buildPdfObjects(pageStreams: string[]): Uint8Array {
  let nextId = 1;
  const catalogId = nextId++;
  const pagesId = nextId++;

  const pagesMeta = pageStreams.map((stream) => {
    const pageId = nextId++;
    const contentId = nextId++;
    return { pageId, contentId, stream };
  });

  const fontRegularId = nextId++;
  const fontBoldId = nextId++;
  const maxId = nextId - 1;
  const objects = new Array<string>(maxId + 1).fill("");

  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId] = `<< /Type /Pages /Kids [${pagesMeta
    .map((page) => `${page.pageId} 0 R`)
    .join(" ")}] /Count ${pagesMeta.length} >>`;

  for (const page of pagesMeta) {
    objects[page.contentId] = `<< /Length ${page.stream.length} >>\nstream\n${page.stream}\nendstream`;
    objects[page.pageId] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Contents ${page.contentId} 0 R /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> >>`;
  }

  objects[fontRegularId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[fontBoldId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  let body = "";
  const offsets = new Array<number>(maxId + 1).fill(0);

  for (let i = 1; i <= maxId; i += 1) {
    offsets[i] = body.length;
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = body.length;
  let xref = `xref\n0 ${maxId + 1}\n`;
  xref += "0000000000 65535 f \n";

  for (let i = 1; i <= maxId; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  const trailer = `trailer << /Size ${maxId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new TextEncoder().encode(`%PDF-1.4\n${body}${xref}${trailer}`);
}

function buildSupplierPurchaseOrderPdf(input: SupplierPurchaseOrderPdfInput): Uint8Array {
  const primaryColor = parseHexColor(input.brand.primaryColor, [53, 190, 146]);
  const softColor = parseHexColor(input.brand.softColor, [236, 255, 247]);
  const textColor = parseHexColor(input.brand.textColor, [11, 42, 31]);
  const mutedColor = parseHexColor(input.brand.mutedColor, [100, 116, 139]);
  const borderColor: Rgb = [209, 213, 219];
  const white: Rgb = [255, 255, 255];

  const pages: string[][] = [];
  let commands: string[] = [];
  let cursorTop = PAGE_MARGIN;

  const beginPage = () => {
    commands = [];
    pages.push(commands);
    cursorTop = PAGE_MARGIN;
  };

  const ensureSpace = (height: number) => {
    if (cursorTop + height <= PAGE_BOTTOM_LIMIT) return;
    beginPage();
    text({
      value: `${input.brand.documentTitle} - Continuacion`,
      x: PAGE_MARGIN,
      top: cursorTop + 14,
      size: 11,
      font: "F2",
      color: mutedColor,
    });
    cursorTop += 24;
  };

  const rect = (x: number, top: number, width: number, height: number, mode: "f" | "S", color: Rgb) => {
    const y = PAGE_HEIGHT - top - height;
    const colorCommand = mode === "f" ? `${rgbToPdf(color)} rg` : `${rgbToPdf(color)} RG`;
    commands.push(`${colorCommand}\n${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${mode}`);
  };

  const line = (x1: number, top1: number, x2: number, top2: number, color: Rgb) => {
    const y1 = PAGE_HEIGHT - top1;
    const y2 = PAGE_HEIGHT - top2;
    commands.push(`${rgbToPdf(color)} RG\n0.8 w\n${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  };

  const text = (opts: {
    value: string;
    x: number;
    top: number;
    size?: number;
    font?: "F1" | "F2";
    color?: Rgb;
    align?: "left" | "center" | "right";
    maxWidth?: number;
  }) => {
    const value = sanitizePdfText(opts.value);
    const size = opts.size ?? 11;
    const font = opts.font ?? "F1";
    const color = opts.color ?? textColor;
    const isBold = font === "F2";
    const rawWidth = approxTextWidth(value, size, isBold);
    const width = opts.maxWidth ? Math.min(rawWidth, opts.maxWidth) : rawWidth;
    let x = opts.x;

    if (opts.align === "right") x = opts.x - width;
    if (opts.align === "center") x = opts.x - width / 2;

    const y = PAGE_HEIGHT - opts.top;
    commands.push(
      `BT\n/${font} ${size.toFixed(2)} Tf\n${rgbToPdf(color)} rg\n1 0 0 1 ${x.toFixed(2)} ${y.toFixed(
        2
      )} Tm\n(${escapePdfText(value)}) Tj\nET`
    );
  };

  const drawHeader = () => {
    rect(0, 0, PAGE_WIDTH, 118, "f", primaryColor);
    text({
      value: input.brand.businessName,
      x: PAGE_MARGIN,
      top: 36,
      size: 12,
      font: "F2",
      color: white,
    });
    text({
      value: input.brand.documentTitle,
      x: PAGE_MARGIN,
      top: 64,
      size: 22,
      font: "F2",
      color: white,
    });
    text({
      value: input.orderRef,
      x: PAGE_MARGIN,
      top: 90,
      size: 11,
      color: white,
    });
    cursorTop = 142;
  };

  const drawSummary = () => {
    const fields = [
      { label: "Proveedor", value: input.supplierName },
      { label: "Sede destino", value: input.siteName },
      { label: "Fecha esperada", value: input.expectedAtLabel },
      { label: "Estado", value: input.statusLabel },
    ];

    text({ value: "Resumen", x: PAGE_MARGIN, top: cursorTop + 14, size: 13, font: "F2" });
    cursorTop += 24;

    const colGap = 12;
    const colWidth = (CONTENT_WIDTH - colGap) / 2;
    const boxHeight = 44;

    for (let i = 0; i < fields.length; i += 1) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const x = PAGE_MARGIN + col * (colWidth + colGap);
      const boxTop = cursorTop + row * (boxHeight + 8);

      rect(x, boxTop, colWidth, boxHeight, "S", borderColor);
      text({ value: fields[i].label, x: x + 10, top: boxTop + 16, size: 9, color: mutedColor });
      text({
        value: fields[i].value,
        x: x + 10,
        top: boxTop + 32,
        size: 11,
        font: "F2",
        maxWidth: colWidth - 20,
      });
    }

    cursorTop += Math.ceil(fields.length / 2) * (boxHeight + 8) + 14;
  };

  const drawItems = () => {
    const tableX = PAGE_MARGIN;
    const productColWidth = 355;
    const qtyColWidth = CONTENT_WIDTH - productColWidth;
    const headerHeight = 25;

    ensureSpace(60);
    text({
      value: `Productos solicitados (${input.items.length})`,
      x: PAGE_MARGIN,
      top: cursorTop + 14,
      size: 13,
      font: "F2",
    });
    cursorTop += 24;

    const drawTableHeader = () => {
      rect(tableX, cursorTop, CONTENT_WIDTH, headerHeight, "f", primaryColor);
      text({ value: "Producto", x: tableX + 10, top: cursorTop + 17, size: 9.5, font: "F2", color: white });
      text({
        value: "Cantidad solicitada",
        x: tableX + productColWidth + qtyColWidth - 10,
        top: cursorTop + 17,
        size: 9.5,
        font: "F2",
        color: white,
        align: "right",
      });
      cursorTop += headerHeight;
    };

    drawTableHeader();

    for (const item of input.items) {
      const productLines = wrapText(item.productLabel, productColWidth - 20, 10);
      const rowHeight = Math.max(30, 14 + productLines.length * 12);

      if (cursorTop + rowHeight > PAGE_BOTTOM_LIMIT) {
        beginPage();
        text({
          value: `${input.brand.documentTitle} - Continuacion`,
          x: PAGE_MARGIN,
          top: cursorTop + 14,
          size: 11,
          font: "F2",
          color: mutedColor,
        });
        cursorTop += 24;
        drawTableHeader();
      }

      rect(tableX, cursorTop, CONTENT_WIDTH, rowHeight, "S", borderColor);
      line(tableX + productColWidth, cursorTop, tableX + productColWidth, cursorTop + rowHeight, borderColor);

      productLines.forEach((lineValue, index) => {
        text({
          value: lineValue,
          x: tableX + 10,
          top: cursorTop + 17 + index * 12,
          size: 10,
          maxWidth: productColWidth - 20,
        });
      });

      text({
        value: item.quantityLabel,
        x: tableX + CONTENT_WIDTH - 10,
        top: cursorTop + 18,
        size: 10,
        align: "right",
        maxWidth: qtyColWidth - 20,
      });

      cursorTop += rowHeight;
    }
  };

  const drawNotes = () => {
    const notes = sanitizePdfText(input.notes ?? "");
    if (!notes) return;

    const noteLines = wrapText(notes, CONTENT_WIDTH - 20, 10);
    const boxHeight = 22 + noteLines.length * 12;

    ensureSpace(boxHeight + 36);
    cursorTop += 16;
    text({ value: "Notas", x: PAGE_MARGIN, top: cursorTop + 14, size: 12, font: "F2" });
    cursorTop += 22;

    rect(PAGE_MARGIN, cursorTop, CONTENT_WIDTH, boxHeight, "S", borderColor);
    noteLines.forEach((lineValue, index) => {
      text({
        value: lineValue,
        x: PAGE_MARGIN + 10,
        top: cursorTop + 16 + index * 12,
        size: 10,
        maxWidth: CONTENT_WIDTH - 20,
      });
    });
    cursorTop += boxHeight;
  };

  beginPage();
  drawHeader();
  drawSummary();
  drawItems();
  drawNotes();

  for (let i = 0; i < pages.length; i += 1) {
    const pageCommands = pages[i];
    const footerTop = PAGE_HEIGHT - PAGE_MARGIN + 12;
    const pageLabel = `Pagina ${i + 1}/${pages.length}`;
    const pageLabelX = PAGE_WIDTH - PAGE_MARGIN - approxTextWidth(pageLabel, 9);

    pageCommands.push(
      `BT\n/F1 9 Tf\n${rgbToPdf(mutedColor)} rg\n1 0 0 1 ${PAGE_MARGIN.toFixed(2)} ${(PAGE_HEIGHT - footerTop).toFixed(
        2
      )} Tm\n(${escapePdfText(input.brand.footerText)}) Tj\nET`
    );
    pageCommands.push(
      `BT\n/F1 9 Tf\n${rgbToPdf(mutedColor)} rg\n1 0 0 1 ${pageLabelX.toFixed(2)} ${(PAGE_HEIGHT - footerTop).toFixed(
        2
      )} Tm\n(${escapePdfText(pageLabel)}) Tj\nET`
    );
  }

  return buildPdfObjects(pages.map((page) => page.join("\n")));
}

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const requestUrl = new URL(req.url);
  const token = requestUrl.searchParams.get("t") ?? "";
  const hasValidToken = verifyPurchaseOrderPdfToken(id, token);
  const authSupabase = await createClient();

  if (!hasValidToken) {
    const {
      data: { user },
    } = await authSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { data: canAccess, error: accessErr } = await authSupabase.rpc("has_permission", {
      p_permission_code: "origo.access",
    });
    if (accessErr || !canAccess) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }

  const supabase = hasValidToken ? createServiceRoleClient() : authSupabase;

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select(
      "id,supplier_id,status,created_at,expected_at,total_amount,currency,notes,suppliers(name),sites(name)"
    )
    .eq("id", id)
    .single();

  if (poErr || !po) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { data: items, error: itemsErr } = await supabase
    .from("purchase_order_items")
    .select("product_id,quantity_ordered,quantity_received,unit_cost,line_total,unit,input_unit_label,products(name,sku)")
    .eq("purchase_order_id", id)
    .order("created_at", { ascending: true });

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  const supplierName = (po.suppliers as { name?: string } | null)?.name ?? "-";
  const siteName = (po.sites as { name?: string } | null)?.name ?? "-";
  const orderRef = formatPurchaseOrderRef({ id: po.id, createdAt: po.created_at });
  const productIds = Array.from(
    new Set(((items ?? []) as Array<{ product_id?: string | null }>).map((item) => String(item.product_id ?? "").trim()).filter(Boolean))
  );
  const { data: supplierAliasRows } = productIds.length
    ? await supabase
        .from("product_suppliers")
        .select("product_id,supplier_product_alias")
        .eq("supplier_id", po.supplier_id)
        .in("product_id", productIds)
    : { data: [] as Array<{ product_id: string; supplier_product_alias: string | null }> };
  const supplierAliasesByProduct = new Map<string, string>();
  for (const row of (supplierAliasRows ?? []) as Array<{ product_id: string; supplier_product_alias: string | null }>) {
    const productId = String(row.product_id ?? "").trim();
    const alias = String(row.supplier_product_alias ?? "").trim();
    if (productId && alias) supplierAliasesByProduct.set(productId, alias);
  }

  const currencyCode = String(po.currency ?? "COP");
  const qtyFmt = new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });

  const brandPrimary = process.env.ORIGO_PO_BRAND_PRIMARY ?? "#35BE92";
  const logoPngBytes = hasValidToken ? null : await loadBrandLogoPngBytes();

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

  if (hasValidToken) {
    const supplierRows = (items ?? []).map((row) => {
      const productLabel =
        supplierAliasesByProduct.get(String(row.product_id ?? "").trim()) ||
        String(row.input_unit_label ?? row.unit ?? "").trim() ||
        "Producto";
      const opQty = Number(row.quantity_ordered ?? 0);

      return {
        productLabel,
        quantityLabel: qtyFmt.format(Number.isFinite(opQty) ? opQty : 0),
      };
    });

    const supplierBytes = buildSupplierPurchaseOrderPdf({
      orderRef,
      statusLabel: STATUS_SUPPLIER_LABELS[String(po.status ?? "")] ?? "Solicitud enviada",
      supplierName,
      siteName,
      createdAtLabel: po.created_at ? new Date(po.created_at).toLocaleString("es-CO") : "-",
      expectedAtLabel: po.expected_at ? new Date(po.expected_at).toLocaleDateString("es-CO") : "-",
      notes: po.notes ? String(po.notes) : null,
      items: supplierRows,
      brand: {
        businessName: brand.businessName,
        documentTitle: "Solicitud de compra",
        primaryColor: brand.primaryColor,
        softColor: brand.softColor,
        textColor: brand.textColor,
        mutedColor: brand.mutedColor,
        footerText: brand.footerText,
      },
    });
    const bodyBytes = new Uint8Array(supplierBytes.length);
    bodyBytes.set(supplierBytes);
    const body = new Blob([bodyBytes], { type: "application/pdf" });

    const filename = `${sanitizeFilename(orderRef)}-proveedor.pdf`;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const moneyFmt = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: currencyCode,
  });
  const totalLabel = moneyFmt.format(Number(po.total_amount ?? 0));

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

    return {
      productLabel,
      quantityOperational: `${qtyFmt.format(opQty)} ${unitCode}`.trim(),
      quantityBase: `${qtyFmt.format(normalizedQty.baseQuantity)} ${normalizedQty.baseUnit}`.trim(),
      unitCostOperational: `${moneyFmt.format(opCost)} / ${unitCode}`.trim(),
      unitCostBase: `${moneyFmt.format(normalizedCost.baseUnitCost)} / ${normalizedQty.baseUnit}`.trim(),
      lineTotal: moneyFmt.format(Number(row.line_total ?? opQty * opCost)),
    };
  });

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

  const filename = `${sanitizeFilename(orderRef)}-interno.pdf`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=\"${filename}\"`,
      "Cache-Control": "private, no-store",
    },
  });
}
