import { deflateSync, inflateSync } from "node:zlib";

type Rgb = [number, number, number];

type PdfFont = "F1" | "F2";
type Align = "left" | "center" | "right";

type PdfLineItem = {
  productLabel: string;
  quantityOperational: string;
  quantityBase: string;
  unitCostOperational: string;
  unitCostBase: string;
  lineTotal: string;
};

type PurchaseOrderPdfBrand = {
  businessName: string;
  documentTitle: string;
  logoText: string;
  logoPngBytes?: Uint8Array | null;
  primaryColor: string;
  waveColor?: string;
  headerColor?: string;
  softColor: string;
  textColor: string;
  mutedColor: string;
  footerText: string;
};

type PurchaseOrderPdfInput = {
  orderRef: string;
  statusLabel: string;
  supplierName: string;
  siteName: string;
  createdAtLabel: string;
  expectedAtLabel: string;
  totalLabel: string;
  notes: string | null;
  items: PdfLineItem[];
  brand: PurchaseOrderPdfBrand;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const PAGE_MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const BOTTOM_LIMIT = PAGE_HEIGHT - PAGE_MARGIN;

function sanitizeText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value: string): string {
  return sanitizeText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function parseHexColor(value: string | undefined, fallback: Rgb): Rgb {
  const v = String(value ?? "").trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return fallback;
  if (v.length === 4) {
    const r = Number.parseInt(v[1] + v[1], 16);
    const g = Number.parseInt(v[2] + v[2], 16);
    const b = Number.parseInt(v[3] + v[3], 16);
    return [r, g, b];
  }
  const r = Number.parseInt(v.slice(1, 3), 16);
  const g = Number.parseInt(v.slice(3, 5), 16);
  const b = Number.parseInt(v.slice(5, 7), 16);
  return [r, g, b];
}

function rgbToPdf(color: Rgb): string {
  return `${(color[0] / 255).toFixed(3)} ${(color[1] / 255).toFixed(3)} ${(color[2] / 255).toFixed(3)}`;
}

function textWidthApprox(text: string, size: number, weight: "normal" | "bold" = "normal"): number {
  const factor = weight === "bold" ? 0.54 : 0.52;
  return sanitizeText(text).length * size * factor;
}

function wrapText(text: string, maxWidth: number, size: number, weight: "normal" | "bold" = "normal"): string[] {
  const clean = sanitizeText(text);
  if (!clean) return [""];
  const words = clean.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (textWidthApprox(next, size, weight) <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [clean];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngToRgb(
  pngBytes: Uint8Array,
  alphaMatte: Rgb = [255, 255, 255]
): { width: number; height: number; rgb: Uint8Array } | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (pngBytes.length < 8) return null;
  for (let i = 0; i < signature.length; i += 1) {
    if (pngBytes[i] !== signature[i]) return null;
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Uint8Array[] = [];

  while (offset + 12 <= pngBytes.length) {
    const length = readUint32BE(pngBytes, offset);
    offset += 4;
    const type = String.fromCharCode(
      pngBytes[offset],
      pngBytes[offset + 1],
      pngBytes[offset + 2],
      pngBytes[offset + 3]
    );
    offset += 4;

    if (offset + length + 4 > pngBytes.length) return null;
    const data = pngBytes.subarray(offset, offset + length);
    offset += length;
    offset += 4; // crc

    if (type === "IHDR") {
      width = readUint32BE(data, 0);
      height = readUint32BE(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (!width || !height) return null;
  if (bitDepth !== 8) return null;
  if (interlace !== 0) return null;
  if (![0, 2, 6].includes(colorType)) return null;
  if (!idatChunks.length) return null;

  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * bytesPerPixel;
  const expectedRawLength = height * (stride + 1);

  const compressed = Buffer.concat(idatChunks.map((chunk) => Buffer.from(chunk)));
  const raw = inflateSync(compressed);
  if (raw.length < expectedRawLength) return null;

  const unfiltered = new Uint8Array(height * stride);
  let rawOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filterType = raw[rawOffset];
    rawOffset += 1;

    const rowStart = y * stride;
    const prevRowStart = (y - 1) * stride;

    for (let x = 0; x < stride; x += 1) {
      const src = raw[rawOffset + x];
      const left = x >= bytesPerPixel ? unfiltered[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? unfiltered[prevRowStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? unfiltered[prevRowStart + x - bytesPerPixel] : 0;

      let value = src;
      if (filterType === 1) value = (src + left) & 0xff;
      if (filterType === 2) value = (src + up) & 0xff;
      if (filterType === 3) value = (src + Math.floor((left + up) / 2)) & 0xff;
      if (filterType === 4) value = (src + paethPredictor(left, up, upLeft)) & 0xff;

      unfiltered[rowStart + x] = value;
    }

    rawOffset += stride;
  }

  const rgb = new Uint8Array(width * height * 3);
  if (colorType === 2) {
    rgb.set(unfiltered);
    return { width, height, rgb };
  }

  if (colorType === 0) {
    let dst = 0;
    for (let i = 0; i < unfiltered.length; i += 1) {
      const g = unfiltered[i];
      rgb[dst] = g;
      rgb[dst + 1] = g;
      rgb[dst + 2] = g;
      dst += 3;
    }
    return { width, height, rgb };
  }

  let dst = 0;
  for (let src = 0; src + 3 < unfiltered.length; src += 4) {
    const alpha = unfiltered[src + 3] / 255;
    rgb[dst] = Math.round(unfiltered[src] * alpha + alphaMatte[0] * (1 - alpha));
    rgb[dst + 1] = Math.round(unfiltered[src + 1] * alpha + alphaMatte[1] * (1 - alpha));
    rgb[dst + 2] = Math.round(unfiltered[src + 2] * alpha + alphaMatte[2] * (1 - alpha));
    dst += 3;
  }
  return { width, height, rgb };
}

type PdfImageResource = {
  name: string;
  objectBody: string;
  width: number;
  height: number;
};

function buildPngImageResource(
  pngBytes: Uint8Array,
  name = "ImBrand",
  alphaMatte: Rgb = [255, 255, 255]
): PdfImageResource | null {
  const decoded = decodePngToRgb(pngBytes, alphaMatte);
  if (!decoded) return null;

  const compressed = deflateSync(Buffer.from(decoded.rgb));
  const hexPayload = Buffer.from(compressed).toString("hex").toUpperCase() + ">";
  const objectBody =
    `<< /Type /XObject /Subtype /Image /Width ${decoded.width} /Height ${decoded.height} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /FlateDecode] /Length ${hexPayload.length} >>\n` +
    `stream\n${hexPayload}\nendstream`;

  return {
    name,
    objectBody,
    width: decoded.width,
    height: decoded.height,
  };
}

function buildPurchaseOrderPdfObjects(pageStreams: string[], imageResource?: PdfImageResource | null): Uint8Array {
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
  const imageId = imageResource ? nextId++ : null;
  const maxId = nextId - 1;

  const objects = new Array<string>(maxId + 1).fill("");

  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId] = `<< /Type /Pages /Kids [${pagesMeta
    .map((p) => `${p.pageId} 0 R`)
    .join(" ")}] /Count ${pagesMeta.length} >>`;

  for (const page of pagesMeta) {
    objects[page.contentId] = `<< /Length ${page.stream.length} >>\nstream\n${page.stream}\nendstream`;
    const xObjectPart = imageId && imageResource ? ` /XObject << /${imageResource.name} ${imageId} 0 R >>` : "";
    objects[page.pageId] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Contents ${page.contentId} 0 R /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >>${xObjectPart} >> >>`;
  }

  objects[fontRegularId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[fontBoldId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  if (imageId && imageResource) {
    objects[imageId] = imageResource.objectBody;
  }

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
  const pdf = `%PDF-1.4\n${body}${xref}${trailer}`;
  return new TextEncoder().encode(pdf);
}

export function buildPurchaseOrderPdf(input: PurchaseOrderPdfInput): Uint8Array {
  const primaryColor = parseHexColor(
    input.brand.headerColor ?? input.brand.primaryColor,
    [11, 91, 67]
  );
  const softColor = parseHexColor(input.brand.softColor, [236, 255, 247]);
  const textColor = parseHexColor(input.brand.textColor, [11, 42, 31]);
  const mutedColor = parseHexColor(input.brand.mutedColor, [100, 116, 139]);
  const white: Rgb = [255, 255, 255];
  const headerMuted: Rgb = [209, 250, 229];
  const borderColor: Rgb = [209, 213, 219];
  const logoImage = input.brand.logoPngBytes
    ? buildPngImageResource(input.brand.logoPngBytes, "ImBrand", primaryColor)
    : null;

  const pages: string[][] = [];
  let commands: string[] = [];
  let cursorTop = PAGE_MARGIN;

  const beginPage = () => {
    commands = [];
    pages.push(commands);
    cursorTop = PAGE_MARGIN;
  };

  const ensureSpace = (height: number) => {
    if (cursorTop + height <= BOTTOM_LIMIT) return;
    beginPage();
  };

  const rect = (x: number, top: number, w: number, h: number, mode: "f" | "S", color: Rgb) => {
    const y = PAGE_HEIGHT - top - h;
    const colorCmd = mode === "f" ? `${rgbToPdf(color)} rg` : `${rgbToPdf(color)} RG`;
    commands.push(`${colorCmd}\n${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${mode}`);
  };

  const line = (x1: number, top1: number, x2: number, top2: number, color: Rgb) => {
    const y1 = PAGE_HEIGHT - top1;
    const y2 = PAGE_HEIGHT - top2;
    commands.push(`${rgbToPdf(color)} RG\n0.8 w\n${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  };

  const wave = (x: number, top: number, w: number, h: number, color: Rgb) => {
    const yBase = PAGE_HEIGHT - top;
    const yBottom = PAGE_HEIGHT - top - h;
    const xEnd = x + w;

    commands.push(
      `${rgbToPdf(color)} rg\n` +
        `${x.toFixed(2)} ${yBase.toFixed(2)} m\n` +
        `${(x + w * 0.18).toFixed(2)} ${(yBase + 18).toFixed(2)} ${(x + w * 0.32).toFixed(2)} ${(yBase - 18).toFixed(
          2
        )} ${(x + w * 0.5).toFixed(2)} ${yBase.toFixed(2)} c\n` +
        `${(x + w * 0.68).toFixed(2)} ${(yBase + 18).toFixed(2)} ${(x + w * 0.82).toFixed(2)} ${(yBase - 12).toFixed(
          2
        )} ${xEnd.toFixed(2)} ${yBase.toFixed(2)} c\n` +
        `${xEnd.toFixed(2)} ${yBottom.toFixed(2)} l\n` +
        `${x.toFixed(2)} ${yBottom.toFixed(2)} l\nh\nf`
    );
  };

  const drawImage = (name: string, x: number, top: number, w: number, h: number) => {
    const y = PAGE_HEIGHT - top - h;
    commands.push(
      `q\n${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/${name} Do\nQ`
    );
  };

  const text = (opts: {
    value: string;
    x: number;
    top: number;
    size?: number;
    font?: PdfFont;
    color?: Rgb;
    align?: Align;
    maxWidth?: number;
  }) => {
    const value = sanitizeText(opts.value);
    const size = opts.size ?? 11;
    const font = opts.font ?? "F1";
    const color = opts.color ?? textColor;
    const weight = font === "F2" ? "bold" : "normal";
    const rawWidth = textWidthApprox(value, size, weight);
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
    ensureSpace(148);
    const headerHeight = 136;
    const headerTop = 0;
    rect(0, headerTop, PAGE_WIDTH, headerHeight, "f", primaryColor);
    rect(0, headerTop, PAGE_WIDTH, 7, "f", primaryColor);
    wave(0, headerTop + 103, PAGE_WIDTH, 33, primaryColor);

    const logoFrameX = PAGE_MARGIN;
    const logoFrameTop = headerTop + 20;
    const logoFrameSize = 70;
    const brandTextX = logoFrameX + logoFrameSize + 20;

    if (logoImage) {
      const scale = Math.min(logoFrameSize / logoImage.width, logoFrameSize / logoImage.height);
      const drawW = logoImage.width * scale;
      const drawH = logoImage.height * scale;
      const drawX = logoFrameX + (logoFrameSize - drawW) / 2;
      const drawTop = logoFrameTop + (logoFrameSize - drawH) / 2;
      drawImage(logoImage.name, drawX, drawTop, drawW, drawH);
    } else {
      text({
        value: input.brand.logoText || "VG",
        x: logoFrameX + logoFrameSize / 2,
        top: headerTop + 54,
        size: 16,
        font: "F2",
        color: white,
        align: "center",
      });
    }
    text({
      value: input.brand.businessName,
      x: brandTextX,
      top: headerTop + 36,
      size: 12,
      font: "F2",
      color: white,
    });
    text({
      value: input.brand.documentTitle,
      x: brandTextX,
      top: headerTop + 62,
      size: 20,
      font: "F2",
      color: white,
    });
    text({
      value: input.orderRef,
      x: brandTextX,
      top: headerTop + 84,
      size: 11,
      font: "F1",
      color: headerMuted,
    });

    cursorTop = headerHeight + 18;
  };

  const drawSummary = () => {
    const fields: Array<{ label: string; value: string }> = [
      { label: "Estado", value: input.statusLabel },
      { label: "Proveedor", value: input.supplierName },
      { label: "Sede", value: input.siteName },
      { label: "Creada", value: input.createdAtLabel },
      { label: "Esperada", value: input.expectedAtLabel },
      { label: "Total", value: input.totalLabel },
    ];

    ensureSpace(24);
    text({ value: "Resumen", x: PAGE_MARGIN, top: cursorTop + 14, size: 13, font: "F2" });
    cursorTop += 24;

    const colGap = 12;
    const colWidth = (CONTENT_WIDTH - colGap) / 2;
    const boxHeight = 44;

    for (let i = 0; i < fields.length; i += 1) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const boxTop = cursorTop + row * (boxHeight + 8);
      ensureSpace(boxHeight + 8);
      const x = PAGE_MARGIN + col * (colWidth + colGap);
      rect(x, boxTop, colWidth, boxHeight, "S", borderColor);
      text({ value: fields[i].label, x: x + 10, top: boxTop + 16, size: 9, color: mutedColor });
      text({ value: fields[i].value, x: x + 10, top: boxTop + 32, size: 11, font: "F2", maxWidth: colWidth - 20 });
    }

    cursorTop += Math.ceil(fields.length / 2) * (boxHeight + 8) + 8;
  };

  const drawUnitsLegend = () => {
    ensureSpace(34);
    rect(PAGE_MARGIN, cursorTop, CONTENT_WIDTH, 28, "S", borderColor);
    text({
      value:
        "Cantidad op = unidad operativa de compra. Cantidad base y costo base = equivalencia normalizada por unidad base.",
      x: PAGE_MARGIN + 10,
      top: cursorTop + 18,
      size: 9,
      color: mutedColor,
      maxWidth: CONTENT_WIDTH - 20,
    });
    cursorTop += 36;
  };

  const tableX = PAGE_MARGIN;
  const tableCols = [
    { label: "Producto", width: 185, align: "left" as Align },
    { label: "Cant op", width: 62, align: "right" as Align },
    { label: "Cant base", width: 66, align: "right" as Align },
    { label: "Costo op", width: 66, align: "right" as Align },
    { label: "Costo base", width: 66, align: "right" as Align },
    { label: "Total", width: 66, align: "right" as Align },
  ];
  const tableHeaderHeight = 24;

  const drawTableHeader = () => {
    rect(tableX, cursorTop, CONTENT_WIDTH, tableHeaderHeight, "f", primaryColor);
    let x = tableX;
    for (const col of tableCols) {
      const textX = col.align === "right" ? x + col.width - 8 : x + 8;
      text({
        value: col.label,
        x: textX,
        top: cursorTop + 16,
        size: 9,
        font: "F2",
        color: white,
        align: col.align === "right" ? "right" : "left",
      });
      x += col.width;
    }
    cursorTop += tableHeaderHeight;
  };

  const drawItems = () => {
    ensureSpace(30);
    text({
      value: `Lineas (${input.items.length})`,
      x: PAGE_MARGIN,
      top: cursorTop + 14,
      size: 13,
      font: "F2",
    });
    cursorTop += 22;

    drawTableHeader();

    for (const item of input.items) {
      const productLines = wrapText(item.productLabel, tableCols[0].width - 16, 10, "normal");
      const rowHeight = Math.max(26, 14 + productLines.length * 11);

      if (cursorTop + rowHeight > BOTTOM_LIMIT) {
        beginPage();
        text({
          value: `${input.brand.documentTitle} - Continuacion`,
          x: PAGE_MARGIN,
          top: cursorTop + 14,
          size: 11,
          font: "F2",
          color: mutedColor,
        });
        cursorTop += 20;
        drawTableHeader();
      }

      rect(tableX, cursorTop, CONTENT_WIDTH, rowHeight, "S", borderColor);

      let x = tableX;
      for (let i = 0; i < tableCols.length; i += 1) {
        const col = tableCols[i];
        if (i > 0) {
          line(x, cursorTop, x, cursorTop + rowHeight, borderColor);
        }

        if (i === 0) {
          productLines.forEach((ln, index) => {
            text({
              value: ln,
              x: x + 8,
              top: cursorTop + 14 + index * 11,
              size: 10,
              maxWidth: col.width - 16,
            });
          });
        } else {
          const value =
            i === 1
              ? item.quantityOperational
              : i === 2
                ? item.quantityBase
                : i === 3
                  ? item.unitCostOperational
                  : i === 4
                    ? item.unitCostBase
                    : item.lineTotal;

          text({
            value,
            x: col.align === "right" ? x + col.width - 8 : x + 8,
            top: cursorTop + 16,
            size: 10,
            align: col.align === "right" ? "right" : "left",
            maxWidth: col.width - 16,
          });
        }

        x += col.width;
      }

      cursorTop += rowHeight;
    }
  };

  const drawNotes = () => {
    const notes = sanitizeText(input.notes ?? "");
    if (!notes) return;

    const noteLines = wrapText(notes, CONTENT_WIDTH - 20, 10);
    const boxHeight = 20 + noteLines.length * 12;
    ensureSpace(boxHeight + 30);

    cursorTop += 12;
    text({ value: "Notas", x: PAGE_MARGIN, top: cursorTop + 14, size: 12, font: "F2" });
    cursorTop += 20;

    rect(PAGE_MARGIN, cursorTop, CONTENT_WIDTH, boxHeight, "S", borderColor);
    noteLines.forEach((lineValue, index) => {
      text({
        value: lineValue,
        x: PAGE_MARGIN + 10,
        top: cursorTop + 15 + index * 12,
        size: 10,
      });
    });

    cursorTop += boxHeight;
  };

  beginPage();
  drawHeader();
  drawSummary();
  drawUnitsLegend();
  drawItems();
  drawNotes();

  for (let i = 0; i < pages.length; i += 1) {
    const pageCommands = pages[i];
    const footerTop = PAGE_HEIGHT - PAGE_MARGIN + 12;
    const pageLabel = `Pagina ${i + 1}/${pages.length}`;
    const pageLabelX =
      PAGE_WIDTH - PAGE_MARGIN - textWidthApprox(pageLabel, 9, "normal");
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

  return buildPurchaseOrderPdfObjects(
    pages.map((page) => page.join("\n")),
    logoImage
  );
}
