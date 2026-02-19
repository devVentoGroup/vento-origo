export function formatPurchaseOrderRef(params: {
  id: string;
  createdAt?: string | null;
}): string {
  const id = String(params.id ?? "").trim();
  if (!id) return "OC-SIN-ID";

  const created = params.createdAt ? new Date(params.createdAt) : null;
  const hasDate = created && !Number.isNaN(created.getTime());
  const yyyy = hasDate ? String(created.getFullYear()) : "0000";
  const mm = hasDate ? String(created.getMonth() + 1).padStart(2, "0") : "00";
  const dd = hasDate ? String(created.getDate()).padStart(2, "0") : "00";
  const suffix = id.replace(/-/g, "").slice(0, 6).toUpperCase();

  return `OC-${yyyy}${mm}${dd}-${suffix}`;
}

