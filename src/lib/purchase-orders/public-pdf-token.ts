import crypto from "node:crypto";

const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getSecret(): string {
  return (
    process.env.PURCHASE_ORDER_PDF_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SESSION_SECRET ||
    "origo-po-public-pdf-dev-secret"
  );
}

function sign(poId: string, issuedAtSec: number): string {
  const payload = `${poId}.${issuedAtSec}`;
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function createPurchaseOrderPdfToken(poId: string): string {
  const issuedAtSec = Math.floor(Date.now() / 1000);
  const signature = sign(poId, issuedAtSec);
  return `${issuedAtSec}.${signature}`;
}

export function verifyPurchaseOrderPdfToken(poId: string, token: string): boolean {
  const raw = String(token ?? "").trim();
  if (!raw) return false;

  const [issuedAtRaw, signatureRaw] = raw.split(".");
  const issuedAtSec = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAtSec) || !signatureRaw) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - issuedAtSec) > TOKEN_MAX_AGE_SECONDS) return false;

  const expected = sign(poId, issuedAtSec);
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureRaw), Buffer.from(expected));
  } catch {
    return false;
  }
}

