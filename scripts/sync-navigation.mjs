#!/usr/bin/env node

// VENTO OS / ORIGO
// Sync Next.js App Router pages into app_screen_registry.
// This version also writes navigation_kind, is_menu_candidate and parent_href
// after upserting, because the shared RPC only receives the registry metadata.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const APP_CODE = "origo";
const APP_ROOT = path.join(process.cwd(), "src", "app");
const ENV_FILES = [".env.local", ".env"];

const ROUTE_GROUP_RE = /^\(.+\)$/;
const DYNAMIC_SEGMENT_RE = /^\[.+\]$/;

const EXCLUDED_DIRS = new Set([
  "api",
  "_components",
  "components",
  "_lib",
  "lib",
  "_actions",
  "actions",
]);

const GROUP_RULES = [
  {
    test: (href) => href.startsWith("/purchase-orders"),
    groupKey: "purchasing",
    groupLabel: "Compras",
    groupOrder: 20,
    sortOrder: 10,
    label: "Órdenes de compra",
    description: "Creación y seguimiento de órdenes de compra",
    permission: "origo.procurement.purchase_orders",
  },
  {
    test: (href) => href.startsWith("/receipts"),
    groupKey: "purchasing",
    groupLabel: "Compras",
    groupOrder: 20,
    sortOrder: 20,
    label: "Recepciones",
    description: "Recepción de compras con OC y recepción directa",
    permission: "origo.procurement.receipts",
  },
  {
    test: (href) => href.startsWith("/suppliers"),
    groupKey: "catalog",
    groupLabel: "Catálogo",
    groupOrder: 30,
    sortOrder: 10,
    label: "Proveedores",
    description: "Directorio y gestión de proveedores",
    permission: "origo.suppliers.view",
  },
  {
    test: (href) => href.startsWith("/product-master-review"),
    groupKey: "catalog",
    groupLabel: "Catálogo",
    groupOrder: 30,
    sortOrder: 20,
    label: "Revisión de productos",
    description: "Revisión administrativa de productos, proveedores y presentaciones pendientes",
    permission: "origo.product_master_review.view",
  },
  {
    test: (href) => href.startsWith("/products") || href.startsWith("/catalog"),
    groupKey: "catalog",
    groupLabel: "Catálogo",
    groupOrder: 30,
    sortOrder: 30,
    label: null,
    description: "Catálogo de productos e insumos",
    permission: "origo.products.view",
  },
  {
    test: (href) => href.startsWith("/reports"),
    groupKey: "reports",
    groupLabel: "Reportes",
    groupOrder: 40,
    sortOrder: 10,
    label: null,
    description: "Reportes de compras y proveedores",
    permission: "origo.reports.view",
  },
  {
    test: (href) => href.startsWith("/settings"),
    groupKey: "configuration",
    groupLabel: "Configuración",
    groupOrder: 90,
    sortOrder: 10,
    label: null,
    description: "Configuración de ORIGO",
    permission: "origo.settings.manage",
  },
];

const CANONICAL_MENU_ROUTES = new Set([
  "/purchase-orders",
  "/receipts",
  "/suppliers",
  "/product-master-review",
]);

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function loadEnv() {
  for (const file of ENV_FILES) {
    loadEnvFile(path.join(process.cwd(), file));
  }
}

function walk(dir) {
  if (!existsSync(dir)) return [];

  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      files.push(...walk(fullPath));
      continue;
    }

    if (entry.isFile() && (entry.name === "page.tsx" || entry.name === "page.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function routeFromPageFile(filePath) {
  const relative = path.relative(APP_ROOT, filePath);
  const dir = path.dirname(relative);
  const rawSegments = dir === "." ? [] : dir.split(path.sep);

  const segments = rawSegments.filter((segment) => {
    if (!segment) return false;
    if (ROUTE_GROUP_RE.test(segment)) return false;
    return true;
  });

  const href = "/" + segments.join("/");
  return href === "/" ? "/" : href.replace(/\/+/g, "/").replace(/\/$/, "");
}

function titleCase(value) {
  return String(value || "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function labelFromHref(href) {
  if (href === "/") return "Panel";

  const last = href.split("/").filter(Boolean).at(-1) || "Página";
  const known = new Map([
    ["purchase-orders", "Órdenes de compra"],
    ["receipts", "Recepciones"],
    ["suppliers", "Proveedores"],
    ["product-master-review", "Revisión de productos"],
    ["settings", "Configuración"],
    ["reports", "Reportes"],
    ["new", "Nuevo"],
    ["edit", "Editar"],
  ]);

  return known.get(last) || titleCase(last);
}

function permissionFromHref(href) {
  if (href === "/") return "origo.access";

  const clean = href
    .split("/")
    .filter(Boolean)
    .filter((segment) => !DYNAMIC_SEGMENT_RE.test(segment))
    .join(".");

  return `origo.${clean || "access"}.view`
    .replace(/-/g, "_")
    .replace(/\.\.+/g, ".");
}

function parentForRoute(href) {
  if (href.startsWith("/purchase-orders/")) return "/purchase-orders";
  if (href.startsWith("/receipts/")) return "/receipts";
  if (href.startsWith("/suppliers/")) return "/suppliers";
  if (href.startsWith("/product-master-review/")) return "/product-master-review";

  const segments = href.split("/").filter(Boolean);
  if (segments.length <= 1) return null;
  return `/${segments[0]}`;
}

function classifyRoute(href) {
  const segments = href.split("/").filter(Boolean);
  const hasDynamicSegment = segments.some((segment) => DYNAMIC_SEGMENT_RE.test(segment));
  const lastSegment = segments.at(-1) || "";

  if (href === "/login" || href === "/no-access" || href.startsWith("/auth")) {
    return { navigationKind: "auth", isMenuCandidate: false, parentHref: null };
  }

  if (CANONICAL_MENU_ROUTES.has(href)) {
    return { navigationKind: "menu", isMenuCandidate: true, parentHref: null };
  }

  if (hasDynamicSegment) {
    return {
      navigationKind: "detail",
      isMenuCandidate: false,
      parentHref: parentForRoute(href),
    };
  }

  if (["new", "edit", "create"].includes(lastSegment)) {
    return {
      navigationKind: "submenu",
      isMenuCandidate: false,
      parentHref: parentForRoute(href),
    };
  }

  if (segments.length > 1) {
    return {
      navigationKind: "submenu",
      isMenuCandidate: false,
      parentHref: parentForRoute(href),
    };
  }

  return {
    navigationKind: "hidden",
    isMenuCandidate: false,
    parentHref: null,
  };
}

function groupForHref(href) {
  const matched = GROUP_RULES.find((rule) => rule.test(href));

  if (matched) {
    return {
      groupKey: matched.groupKey,
      groupLabel: matched.groupLabel,
      groupOrder: matched.groupOrder,
      sortOrder: matched.sortOrder,
      label: matched.label || labelFromHref(href),
      description: matched.description,
      permission: matched.permission || permissionFromHref(href),
    };
  }

  return {
    groupKey: "other",
    groupLabel: "Otros",
    groupOrder: 80,
    sortOrder: 100,
    label: labelFromHref(href),
    description: `Pantalla ${labelFromHref(href)} de ORIGO`,
    permission: permissionFromHref(href),
  };
}

function fileHash(filePath, extraPayload) {
  const source = readFileSync(filePath, "utf-8");
  return createHash("sha256")
    .update(source)
    .update("\n")
    .update(JSON.stringify(extraPayload))
    .digest("hex");
}

async function main() {
  loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      [
        "Missing Supabase env vars.",
        "Required:",
        "  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL",
        "  SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_KEY",
      ].join("\n")
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const pageFiles = walk(APP_ROOT);
  const routes = pageFiles
    .map((sourcePath) => {
      const href = routeFromPageFile(sourcePath);
      const group = groupForHref(href);
      const classification = classifyRoute(href);
      const relativeSourcePath = path.relative(process.cwd(), sourcePath).replace(/\\/g, "/");

      return {
        sourcePath,
        relativeSourcePath,
        href,
        label: group.label,
        description: group.description,
        group,
        classification,
      };
    })
    .filter((route) => route.href !== "/")
    .filter((route) => !route.href.includes("/_"));

  let synced = 0;
  let classified = 0;
  const failures = [];

  for (const route of routes) {
    const syncHash = fileHash(route.sourcePath, {
      href: route.href,
      label: route.label,
      group: route.group,
      classification: route.classification,
    });

    const { error: upsertError } = await supabase.rpc("upsert_app_screen_registry", {
      p_app_code: APP_CODE,
      p_href: route.href,
      p_label: route.label,
      p_description: route.description,
      p_icon: null,
      p_suggested_group_key: route.group.groupKey,
      p_suggested_group_label: route.group.groupLabel,
      p_suggested_group_order: route.group.groupOrder,
      p_suggested_sort_order: route.group.sortOrder,
      p_required_permission_code: route.group.permission,
      p_permission_name: `${route.label} - Ver`,
      p_permission_description: `Permite ver ${route.label} en ORIGO.`,
      p_source_path: route.relativeSourcePath,
      p_sync_source: "origo-sync-navigation",
      p_sync_hash: syncHash,
    });

    if (upsertError) {
      failures.push({ href: route.href, step: "upsert", message: upsertError.message });
      continue;
    }

    synced += 1;

    const { error: classifyError } = await supabase
      .from("app_screen_registry")
      .update({
        navigation_kind: route.classification.navigationKind,
        is_menu_candidate: route.classification.isMenuCandidate,
        parent_href: route.classification.parentHref,
      })
      .eq("app_code", APP_CODE)
      .eq("href", route.href);

    if (classifyError) {
      failures.push({ href: route.href, step: "classify", message: classifyError.message });
      continue;
    }

    classified += 1;
  }

  const summary = routes.reduce((acc, route) => {
    const key = `${route.classification.navigationKind}:${route.classification.isMenuCandidate}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const { data: menuRows, error: menuError } = await supabase
    .from("app_screen_registry")
    .select("href,label,suggested_group_key,suggested_group_label,required_permission_code")
    .eq("app_code", APP_CODE)
    .eq("is_menu_candidate", true)
    .order("suggested_group_key", { ascending: true })
    .order("href", { ascending: true });

  if (menuError) {
    failures.push({ href: "*", step: "menu_preview", message: menuError.message });
  }

  console.log(
    JSON.stringify(
      {
        app: APP_CODE,
        pages_found: routes.length,
        synced,
        classified,
        failed: failures.length,
        classification_summary: summary,
        menu_candidates: menuRows || [],
        failures,
      },
      null,
      2
    )
  );

  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});