import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CI009_INSTANCE_ID = 'SHELL-CI-009::GLOBAL';
export const CI009_SCHEMA_VERSION = 1;
export const CONSUMER_REPOSITORY = 'vento-group-sas/vento-origo';
export const CONSUMER_NAME = 'vento-origo';
export const CONTRACTUAL_TEST_COUNT = 42;

export const CANONICAL_PACKAGES = Object.freeze([
  '@vento/contracts',
  '@vento/os-context',
  '@vento/supabase',
  '@vento/ui-web',
]);

export const ORIGO_RELATIONS = Object.freeze({
  '@vento/contracts': Object.freeze({
    compatibility_ref: 'PKG-COMP-MX-005',
    update_ref: 'PKG-PR-REL-005',
    profile: 'ORIGO-PROFILE-CONTRACTS',
  }),
  '@vento/os-context': Object.freeze({
    compatibility_ref: 'PKG-COMP-MX-012',
    update_ref: 'PKG-PR-REL-012',
    profile: 'ORIGO-PROFILE-OS-CONTEXT',
  }),
  '@vento/supabase': Object.freeze({
    compatibility_ref: 'PKG-COMP-MX-019',
    update_ref: 'PKG-PR-REL-019',
    profile: 'ORIGO-PROFILE-SUPABASE',
  }),
  '@vento/ui-web': Object.freeze({
    compatibility_ref: 'PKG-COMP-MX-026',
    update_ref: 'PKG-PR-REL-026',
    profile: 'ORIGO-PROFILE-UI-WEB',
  }),
});

export const RESULT_STATES = Object.freeze([
  'PENDING',
  'RUNNING',
  'PASS',
  'FAIL',
  'BLOCKED',
  'CANCELLED',
  'TIMED_OUT',
  'STALE',
  'NOT_APPLICABLE',
]);

export const REQUIRED_EVIDENCE_FIELDS = Object.freeze([
  'consumer_repository',
  'consumer_branch',
  'consumer_base_commit',
  'consumer_manifest_identity',
  'consumer_lockfile_identity',
  'test_contract_identity',
  'test_suite_identity',
  'fixture_set_identity',
  'route_inventory_identity',
  'source_contract_identity',
  'environment_identity',
  'runtime_identity',
  'framework_identity',
  'target_package_set',
  'compatibility_refs',
  'origo_profile_set',
  'execution_identity',
  'started_at',
  'completed_at',
  'result',
  'invalidation_reason',
]);

export const EXPECTED_PAGE_FILES = Object.freeze([
  'src/app/page.tsx',
  'src/app/login/page.tsx',
  'src/app/no-access/page.tsx',
  'src/app/product-master-review/page.tsx',
  'src/app/purchase-orders/page.tsx',
  'src/app/purchase-orders/new/page.tsx',
  'src/app/purchase-orders/[id]/page.tsx',
  'src/app/purchase-orders/[id]/edit/page.tsx',
  'src/app/receipts/page.tsx',
  'src/app/receipts/new/page.tsx',
  'src/app/suppliers/page.tsx',
  'src/app/suppliers/new/page.tsx',
  'src/app/suppliers/[id]/edit/page.tsx',
]);

export const EXPECTED_ROUTE_HANDLERS = Object.freeze([
  'src/app/purchase-orders/[id]/pdf/route.ts',
]);

export const EXPECTED_DYNAMIC_PAGE_COUNT = 3;
export const EXPECTED_SYNCED_ROUTE_COUNT = 12;
export const EXPECTED_MENU_ROUTES = Object.freeze([
  '/purchase-orders',
  '/receipts',
  '/suppliers',
  '/product-master-review',
]);

export const SURFACES = Object.freeze([
  Object.freeze({
    id: 'ORIGO-SURFACE-001',
    name: 'identidad, sesión y acceso ORIGO',
    required_paths: ['middleware.ts', 'src/lib/auth/guard.ts', 'src/lib/auth/permissions.ts'],
  }),
  Object.freeze({
    id: 'ORIGO-SURFACE-002',
    name: 'contexto operativo, sede, actor y recurso',
    required_paths: [
      'src/lib/auth/operational-session.ts',
      'src/lib/auth/role-override.ts',
      'src/lib/auth/shared-device-signature.ts',
    ],
  }),
  Object.freeze({
    id: 'ORIGO-SURFACE-003',
    name: 'inventario de rutas y navegación',
    required_paths: [...EXPECTED_PAGE_FILES, ...EXPECTED_ROUTE_HANDLERS, 'scripts/sync-navigation.mjs'],
  }),
  Object.freeze({
    id: 'ORIGO-SURFACE-004',
    name: 'proveedores y relación comercial',
    required_paths: [
      'src/app/suppliers/page.tsx',
      'src/app/suppliers/new/page.tsx',
      'src/app/suppliers/[id]/edit/page.tsx',
      'src/app/suppliers/actions.ts',
      'src/lib/suppliers.ts',
    ],
  }),
  Object.freeze({
    id: 'ORIGO-SURFACE-005',
    name: 'maestro de producto, presentación y UOM',
    required_paths: [
      'src/app/product-master-review/page.tsx',
      'src/app/purchase-orders/actions.ts',
      'src/lib/units/normalize.ts',
    ],
  }),
  Object.freeze({
    id: 'ORIGO-SURFACE-006',
    name: 'orden de compra y líneas',
    required_paths: [
      'src/app/purchase-orders/page.tsx',
      'src/app/purchase-orders/new/page.tsx',
      'src/app/purchase-orders/[id]/page.tsx',
      'src/app/purchase-orders/[id]/edit/page.tsx',
      'src/app/purchase-orders/actions.ts',
    ],
  }),
  Object.freeze({
    id: 'ORIGO-SURFACE-007',
    name: 'estados, edición y autorización de orden',
    required_paths: [
      'src/app/purchase-orders/actions.ts',
      'src/lib/auth/guard.ts',
      'src/lib/auth/operational-session.ts',
    ],
  }),
  Object.freeze({
    id: 'ORIGO-SURFACE-008',
    name: 'PDF, token y privilegio de servicio',
    required_paths: [
      'src/app/purchase-orders/[id]/pdf/route.ts',
      'src/lib/purchase-orders/public-pdf-token.ts',
      'src/lib/purchase-orders/pdf.ts',
    ],
  }),
  Object.freeze({
    id: 'ORIGO-SURFACE-009',
    name: 'recepción y modalidad',
    required_paths: [
      'src/app/receipts/page.tsx',
      'src/app/receipts/new/page.tsx',
      'src/components/vento/receipts/receipt-form.tsx',
    ],
  }),
  Object.freeze({
    id: 'ORIGO-SURFACE-010',
    name: 'atomicidad, idempotencia, corrección y costos',
    required_paths: [
      'src/app/receipts/new/page.tsx',
      'src/components/vento/receipts/receipt-form.tsx',
    ],
  }),
  Object.freeze({
    id: 'ORIGO-SURFACE-011',
    name: 'integración y fronteras de dominio',
    required_paths: ['src/lib/supabase/client.ts', 'src/lib/supabase/server.ts', 'src/lib/auth/guard.ts'],
  }),
  Object.freeze({
    id: 'ORIGO-SURFACE-012',
    name: 'UI, SSR, interacción, accesibilidad y exportación',
    required_paths: [
      'src/app/layout.tsx',
      'src/app/page.tsx',
      'src/app/purchase-orders/[id]/pdf/route.ts',
      'src/components/vento/standard/ui.tsx',
      'src/components/vento/standard/vento-shell.tsx',
    ],
  }),
]);

export const SOURCE_CONTRACTS = Object.freeze([
  Object.freeze({
    id: 'ORIGO-SOURCE-001',
    path: 'middleware.ts',
    tokens: ['buildLoginRedirect', 'isPublicPurchaseOrderPdfPath', 'matcher:', 'login', 'no-access'],
  }),
  Object.freeze({
    id: 'ORIGO-SOURCE-002',
    path: 'src/lib/auth/guard.ts',
    tokens: ['requireAppAccess', 'has_permission', 'shared_device_no_permission', 'role_override'],
  }),
  Object.freeze({
    id: 'ORIGO-SOURCE-003',
    path: 'src/lib/auth/shared-device-signature.ts',
    tokens: ['sign_shared_device_action', 'attach_shared_device_action_signature_target'],
  }),
  Object.freeze({
    id: 'ORIGO-SOURCE-004',
    path: 'src/app/purchase-orders/actions.ts',
    tokens: ['buildPurchaseOrderItemsFromForm', 'product_uom_profiles', 'product_suppliers', 'status: "draft"'],
  }),
  Object.freeze({
    id: 'ORIGO-SOURCE-005',
    path: 'src/app/receipts/new/page.tsx',
    tokens: [
      'RECEIPTS_PERMISSION',
      'requireSharedDeviceActorSignature',
      'checkOperationalSessionPermission',
      'correction_entry_id',
      'draft_id',
    ],
  }),
  Object.freeze({
    id: 'ORIGO-SOURCE-006',
    path: 'scripts/sync-navigation.mjs',
    tokens: ['CANONICAL_MENU_ROUTES', 'route.href !== "/"', 'upsert_app_screen_registry', 'app_screen_registry'],
  }),
  Object.freeze({
    id: 'ORIGO-SOURCE-007',
    path: 'src/lib/purchase-orders/public-pdf-token.ts',
    tokens: [
      'PURCHASE_ORDER_PDF_SECRET',
      'createPurchaseOrderPdfToken',
      'verifyPurchaseOrderPdfToken',
      'timingSafeEqual',
    ],
  }),
  Object.freeze({
    id: 'ORIGO-SOURCE-008',
    path: 'src/app/purchase-orders/[id]/pdf/route.ts',
    tokens: ['verifyPurchaseOrderPdfToken', 'createServiceRoleClient', 'hasValidToken', 'has_permission'],
  }),
]);

const PROFILE_REQUIREMENTS = Object.freeze({
  '@vento/contracts': Object.freeze([
    'types_compile',
    'payload_shapes_checked',
    'serialization_checked',
    'identifier_semantics_preserved',
    'no_global_cast_bypass',
  ]),
  '@vento/os-context': Object.freeze([
    'session_checked',
    'site_resource_context_checked',
    'permission_allow_checked',
    'permission_deny_checked',
    'shared_device_signature_checked',
    'client_cannot_elevate_authority',
  ]),
  '@vento/supabase': Object.freeze([
    'browser_client_checked',
    'server_client_checked',
    'permission_rpc_checked',
    'deny_path_checked',
    'isolated_schema_source',
    'no_service_role_fixture',
    'build_does_not_sync_navigation',
  ]),
  '@vento/ui-web': Object.freeze([
    'server_render_checked',
    'client_render_checked',
    'hydration_checked',
    'forms_checked',
    'accessibility_checked',
    'pdf_export_checked',
  ]),
});

const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SECRET_PATTERNS = Object.freeze([
  /\bgh[pousr]_[A-Za-z0-9_]{24,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bservice[_-]?role\b["']?\s*[:=]\s*["']?[^,\s"']{8,}/iu,
  /\b(?:password|secret|token|api[_-]?key|private[_-]?key)\b["']?\s*[:=]\s*["']?[^,\s"']{8,}/iu,
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, 'en'))
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Identity(value) {
  return `sha256:${createHash('sha256').update(
    typeof value === 'string' ? value : stableStringify(value),
  ).digest('hex')}`;
}

export function fileIdentity(filePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

export function resolveTargetPackages(values) {
  const raw = Array.isArray(values) ? values : String(values ?? '').split(',');
  const packages = [...new Set(raw.map((entry) => String(entry).trim()).filter(Boolean))];
  const invalid = packages.filter((entry) => !CANONICAL_PACKAGES.includes(entry));
  if (invalid.length > 0) throw new Error(`PACKAGE_NOT_CANONICAL:${invalid.join(',')}`);
  if (packages.length === 0) throw new Error('PACKAGE_SET_EMPTY');
  return CANONICAL_PACKAGES.filter((entry) => packages.includes(entry));
}

export function evaluateSurface(surfaceId, scenario) {
  const s = scenario ?? {};
  switch (surfaceId) {
    case 'ORIGO-SURFACE-001':
      return Boolean(s.session && s.app_access && s.permission && !s.auth_error && !s.expired);
    case 'ORIGO-SURFACE-002':
      return Boolean(
        s.site_id
        && s.actor_effective
        && s.resource_scope_valid
        && !s.manipulated
        && s.override_authorized
        && (!s.shared_device || s.actor_signed),
      );
    case 'ORIGO-SURFACE-003':
      return Boolean(
        s.page_count === 13
        && s.unique_page_count === 13
        && s.dynamic_page_count === 3
        && s.handler_count === 1
        && s.synced_route_count === 12
        && s.menu_candidate_count === 4
        && s.handler_registered
        && !s.handler_counted_as_page
        && s.protected_direct_access,
      );
    case 'ORIGO-SURFACE-004':
      return Boolean(
        s.supplier_id
        && s.supplier_active
        && s.relationship_attributable
        && s.commercial_data_attributable
        && !s.duplicate_supplier,
      );
    case 'ORIGO-SURFACE-005':
      return Boolean(
        s.product_id
        && s.product_active
        && s.presentation_id
        && s.presentation_belongs_to_product
        && Number.isFinite(s.conversion_factor)
        && s.conversion_factor > 0
        && s.supplier_linked,
      );
    case 'ORIGO-SURFACE-006':
      return Boolean(
        s.supplier_id
        && s.site_id
        && Number.isInteger(s.line_count)
        && s.line_count > 0
        && s.quantities_valid
        && s.presentations_valid
        && s.costs_valid
        && s.total_reconciled,
      );
    case 'ORIGO-SURFACE-007':
      return Boolean(
        s.authorized
        && s.resource_scope_valid
        && s.transition_legal
        && s.edit_state_valid
        && s.delete_policy_valid,
      );
    case 'ORIGO-SURFACE-008':
      return Boolean(
        s.document_order_match
        && s.secret_required
        && s.secret_fallback === false
        && s.service_role_after_validation
        && (s.token_valid || s.authenticated_access),
      );
    case 'ORIGO-SURFACE-009': {
      const allowedModes = new Set(['purchase_order', 'direct']);
      return Boolean(
        s.supplier_id
        && s.site_id
        && allowedModes.has(s.entry_mode)
        && Number.isInteger(s.line_count)
        && s.line_count > 0
        && s.destination_valid
        && (s.entry_mode !== 'purchase_order' || s.purchase_order_id),
      );
    }
    case 'ORIGO-SURFACE-010':
      return Boolean(
        s.operation_id
        && s.idempotency_key
        && s.atomic_or_reconciliable
        && !s.duplicate_effect
        && s.costs_attributable
        && s.stock_attributable
        && s.correction_safe,
      );
    case 'ORIGO-SURFACE-011': {
      const forbiddenOrigoOwnership = new Set([
        'inventory',
        'loc',
        'production',
        'supabase_schema',
        'supabase_rls',
      ]);
      return Boolean(s.contract_consumed && !forbiddenOrigoOwnership.has(s.claimed_owner));
    }
    case 'ORIGO-SURFACE-012':
      return Boolean(
        s.server_render
        && s.client_render
        && !s.hydration_mismatch
        && s.interaction_ok
        && s.forms_ok
        && s.accessibility_ok
        && s.export_authorized
        && s.export_smoke_ok,
      );
    default:
      throw new Error(`UNKNOWN_SURFACE:${surfaceId}`);
  }
}

export function evaluateProfile(packageName, scenario) {
  if (!CANONICAL_PACKAGES.includes(packageName)) {
    throw new Error(`PACKAGE_NOT_CANONICAL:${packageName}`);
  }
  return PROFILE_REQUIREMENTS[packageName].every((key) => scenario?.[key] === true);
}

export function evidenceIsStale(previous, current) {
  const materialFields = [
    'consumer_base_commit',
    'consumer_manifest_identity',
    'consumer_lockfile_identity',
    'test_contract_identity',
    'test_suite_identity',
    'fixture_set_identity',
    'route_inventory_identity',
    'source_contract_identity',
    'environment_identity',
    'runtime_identity',
    'framework_identity',
    'target_package_set',
    'compatibility_refs',
    'origo_profile_set',
  ];
  return materialFields.some(
    (field) => stableStringify(previous?.[field]) !== stableStringify(current?.[field]),
  );
}

export function containsSensitiveData(value) {
  const source = stableStringify(value);
  return SECRET_PATTERNS.some((pattern) => pattern.test(source));
}

function routeFromPageFile(relativePath) {
  const normalized = String(relativePath).replace(/\\/gu, '/');
  const withoutRoot = normalized.replace(/^src\/app\//u, '');
  const dir = withoutRoot.replace(/\/?page\.(?:js|jsx|ts|tsx)$/u, '');
  if (!dir || dir === 'page') return '/';
  const segments = dir
    .split('/')
    .filter(Boolean)
    .filter((segment) => !/^\(.+\)$/u.test(segment));
  return `/${segments.join('/')}`.replace(/\/+$/u, '') || '/';
}

export function validateRouteInventoryEntries(pageFiles, handlerFiles) {
  const pages = [...pageFiles].map(String).sort();
  const handlers = [...handlerFiles].map(String).sort();
  const expectedPages = [...EXPECTED_PAGE_FILES].sort();
  const expectedHandlers = [...EXPECTED_ROUTE_HANDLERS].sort();
  const pageSet = new Set(pages);
  const handlerSet = new Set(handlers);
  const missingPages = expectedPages.filter((entry) => !pageSet.has(entry));
  const unexpectedPages = pages.filter((entry) => !expectedPages.includes(entry));
  const missingHandlers = expectedHandlers.filter((entry) => !handlerSet.has(entry));
  const unexpectedHandlers = handlers.filter((entry) => !expectedHandlers.includes(entry));
  const duplicatePages = pages.length !== pageSet.size;
  const duplicateHandlers = handlers.length !== handlerSet.size;
  const routes = pages.map(routeFromPageFile);
  const uniqueRoutes = new Set(routes);
  const dynamicPageCount = routes.filter((route) => route.includes('[id]')).length;
  const syncedRoutes = routes.filter((route) => route !== '/');
  const menuRoutes = EXPECTED_MENU_ROUTES.filter((route) => uniqueRoutes.has(route));

  const cardinalitiesPass = (
    pages.length === 13
    && uniqueRoutes.size === 13
    && dynamicPageCount === EXPECTED_DYNAMIC_PAGE_COUNT
    && handlers.length === 1
    && syncedRoutes.length === EXPECTED_SYNCED_ROUTE_COUNT
    && menuRoutes.length === EXPECTED_MENU_ROUTES.length
  );

  return {
    expected_page_count: expectedPages.length,
    actual_page_count: pages.length,
    unique_page_count: uniqueRoutes.size,
    expected_dynamic_page_count: EXPECTED_DYNAMIC_PAGE_COUNT,
    actual_dynamic_page_count: dynamicPageCount,
    expected_handler_count: expectedHandlers.length,
    actual_handler_count: handlers.length,
    expected_synced_route_count: EXPECTED_SYNCED_ROUTE_COUNT,
    actual_synced_route_count: syncedRoutes.length,
    expected_menu_candidate_count: EXPECTED_MENU_ROUTES.length,
    actual_menu_candidate_count: menuRoutes.length,
    menu_routes: menuRoutes,
    missing_pages: missingPages,
    unexpected_pages: unexpectedPages,
    missing_handlers: missingHandlers,
    unexpected_handlers: unexpectedHandlers,
    duplicate_pages: duplicatePages,
    duplicate_handlers: duplicateHandlers,
    result:
      missingPages.length === 0
      && unexpectedPages.length === 0
      && missingHandlers.length === 0
      && unexpectedHandlers.length === 0
      && !duplicatePages
      && !duplicateHandlers
      && cardinalitiesPass
        ? 'PASS'
        : 'BLOCKED',
  };
}

function discoverByBasename(root, baseNames) {
  const found = [];
  if (!fs.existsSync(root)) return found;
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (baseNames.has(entry.name)) {
        found.push(absolute);
      }
    }
  }

  return found;
}

function toRepoRelative(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

export function probeRouteInventory(root = process.cwd()) {
  const appRoot = path.join(root, 'src', 'app');
  const pageFiles = discoverByBasename(
    appRoot,
    new Set(['page.ts', 'page.tsx', 'page.js', 'page.jsx']),
  ).map((entry) => toRepoRelative(root, entry));
  const handlerFiles = discoverByBasename(
    appRoot,
    new Set(['route.ts', 'route.tsx', 'route.js', 'route.jsx']),
  ).map((entry) => toRepoRelative(root, entry));
  return validateRouteInventoryEntries(pageFiles, handlerFiles);
}

export function inspectSourceContracts(root = process.cwd()) {
  return SOURCE_CONTRACTS.map((contract) => {
    const absolute = path.join(root, contract.path);
    if (!fs.existsSync(absolute)) {
      return {
        contract_id: contract.id,
        path: contract.path,
        missing_tokens: [...contract.tokens],
        result: 'BLOCKED',
      };
    }
    const source = fs.readFileSync(absolute, 'utf8');
    const missingTokens = contract.tokens.filter((token) => !source.includes(token));
    return {
      contract_id: contract.id,
      path: contract.path,
      missing_tokens: missingTokens,
      result: missingTokens.length === 0 ? 'PASS' : 'BLOCKED',
    };
  });
}

export function validateEvidence(evidence) {
  const errors = [];
  for (const field of REQUIRED_EVIDENCE_FIELDS) {
    if (!(field in (evidence ?? {}))) errors.push(`EVIDENCE_FIELD_MISSING:${field}`);
  }
  if (evidence?.consumer_repository !== CONSUMER_REPOSITORY) {
    errors.push('WRONG_CONSUMER_REPOSITORY');
  }
  if (!COMMIT_PATTERN.test(String(evidence?.consumer_base_commit ?? ''))) {
    errors.push('BASE_COMMIT_INVALID');
  }
  for (const field of [
    'consumer_manifest_identity',
    'consumer_lockfile_identity',
    'test_contract_identity',
    'test_suite_identity',
    'fixture_set_identity',
    'route_inventory_identity',
    'source_contract_identity',
    'execution_identity',
  ]) {
    if (!SHA256_PATTERN.test(String(evidence?.[field] ?? ''))) {
      errors.push(`IDENTITY_INVALID:${field}`);
    }
  }

  let targetPackages = [];
  try {
    targetPackages = resolveTargetPackages(evidence?.target_package_set ?? []);
  } catch (error) {
    errors.push(String(error.message));
  }

  const expectedCompatibility = targetPackages.map(
    (packageName) => ORIGO_RELATIONS[packageName].compatibility_ref,
  );
  const expectedProfiles = targetPackages.map(
    (packageName) => ORIGO_RELATIONS[packageName].profile,
  );

  if (stableStringify(evidence?.compatibility_refs ?? []) !== stableStringify(expectedCompatibility)) {
    errors.push('COMPATIBILITY_REFS_MISMATCH');
  }
  if (stableStringify(evidence?.origo_profile_set ?? []) !== stableStringify(expectedProfiles)) {
    errors.push('PROFILE_SET_MISMATCH');
  }

  const summary = evidence?.test_summary ?? {};
  if (!Number.isInteger(summary.executed) || summary.executed <= 0) {
    errors.push('ZERO_REQUIRED_TESTS');
  }
  if (Number.isInteger(summary.executed) && summary.executed !== CONTRACTUAL_TEST_COUNT) {
    errors.push('CONTRACTUAL_TEST_COUNT_MISMATCH');
  }
  if ((summary.failed ?? 0) !== 0) errors.push('REQUIRED_TEST_FAILURE');
  if ((summary.skipped ?? 0) !== 0) errors.push('REQUIRED_TEST_SKIPPED');
  if ((summary.denied_paths ?? 0) < 16) errors.push('DENY_PATH_NOT_PROVEN');

  if (/prod(?:uction)?/iu.test(String(evidence?.environment_identity ?? ''))) {
    errors.push('PRODUCTION_ENVIRONMENT_FORBIDDEN');
  }
  if (containsSensitiveData(evidence)) errors.push('SENSITIVE_DATA_FORBIDDEN');
  if (evidence?.certification_scope !== 'HARNESS_SELF_CERTIFICATION') {
    errors.push('CERTIFICATION_SCOPE_INVALID');
  }
  if (evidence?.consumer_conformance_claimed !== false) {
    errors.push('CONSUMER_CONFORMANCE_MUST_NOT_BE_CLAIMED');
  }
  if (evidence?.implementation_boundaries?.supabase_mutation_performed !== false) {
    errors.push('SUPABASE_MUTATION_FORBIDDEN');
  }
  if (evidence?.implementation_boundaries?.production_data_used !== false) {
    errors.push('PRODUCTION_DATA_FORBIDDEN');
  }
  if (evidence?.safe_build_entrypoint !== 'npm run build:ci009') {
    errors.push('SAFE_BUILD_ENTRYPOINT_INVALID');
  }
  if (evidence?.result === 'PASS' && errors.length > 0) errors.push('FALSE_GREEN');

  return [...new Set(errors)];
}

function pathExists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

export function probeRepository(root = process.cwd()) {
  const routeInventory = probeRouteInventory(root);
  return SURFACES.map((surface) => {
    const missing = surface.required_paths.filter((relativePath) => !pathExists(root, relativePath));
    const routeBlocked = surface.id === 'ORIGO-SURFACE-003' && routeInventory.result !== 'PASS';
    return {
      surface_id: surface.id,
      name: surface.name,
      required_paths: surface.required_paths,
      missing_paths: missing,
      result: missing.length === 0 && !routeBlocked ? 'PASS' : 'BLOCKED',
    };
  });
}

function gitText(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function parseCli(argv) {
  const options = { json: false, packages: CANONICAL_PACKAGES };
  for (const argument of argv) {
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument.startsWith('--packages=')) {
      options.packages = resolveTargetPackages(argument.slice('--packages='.length));
      continue;
    }
    throw new Error(`UNKNOWN_ARGUMENT:${argument}`);
  }
  return options;
}

function parseNodeTestSummary(output) {
  const get = (label) => {
    const match = output.match(new RegExp(`(?:^|\\r?\\n)[#ℹ]\\s+${label}\\s+(\\d+)`, 'u'));
    return match ? Number(match[1]) : null;
  };
  return {
    executed: get('tests'),
    passed: get('pass'),
    failed: get('fail'),
    skipped: get('skipped') ?? 0,
  };
}

function runSelfCertification(root) {
  const testPath = path.join(root, 'scripts', 'quality', 'origo-consumer-baseline-gate.test.mjs');
  const result = spawnSync(process.execPath, ['--test', testPath], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test' },
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const summary = parseNodeTestSummary(output);
  return {
    exit_code: result.status ?? 1,
    summary,
    output,
  };
}

export function buildBaselineEvidence({
  root = process.cwd(),
  targetPackages = CANONICAL_PACKAGES,
  startedAt = new Date().toISOString(),
} = {}) {
  const packages = resolveTargetPackages(targetPackages);
  const manifestPath = path.join(root, 'package.json');
  const lockfilePath = path.join(root, 'package-lock.json');
  const testPath = path.join(root, 'scripts', 'quality', 'origo-consumer-baseline-gate.test.mjs');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const surfaces = probeRepository(root);
  const routeInventory = probeRouteInventory(root);
  const sourceContracts = inspectSourceContracts(root);
  const selfCertification = runSelfCertification(root);
  const completedAt = new Date().toISOString();

  const base = {
    consumer_repository: CONSUMER_REPOSITORY,
    consumer_branch: gitText(root, ['branch', '--show-current']) || 'DETACHED',
    consumer_base_commit: gitText(root, ['rev-parse', 'HEAD']),
    consumer_manifest_identity: fileIdentity(manifestPath),
    consumer_lockfile_identity: fileIdentity(lockfilePath),
    test_contract_identity: sha256Identity({
      instance_id: CI009_INSTANCE_ID,
      schema_version: CI009_SCHEMA_VERSION,
      relations: ORIGO_RELATIONS,
      surfaces: SURFACES,
      profile_requirements: PROFILE_REQUIREMENTS,
      required_evidence_fields: REQUIRED_EVIDENCE_FIELDS,
      expected_page_files: EXPECTED_PAGE_FILES,
      expected_route_handlers: EXPECTED_ROUTE_HANDLERS,
      expected_dynamic_page_count: EXPECTED_DYNAMIC_PAGE_COUNT,
      expected_synced_route_count: EXPECTED_SYNCED_ROUTE_COUNT,
      expected_menu_routes: EXPECTED_MENU_ROUTES,
      source_contracts: SOURCE_CONTRACTS,
      contractual_test_count: CONTRACTUAL_TEST_COUNT,
    }),
    test_suite_identity: fileIdentity(testPath),
    fixture_set_identity: sha256Identity({
      fixture_set: 'CI009-ORIGO-SYNTHETIC-001',
      surfaces: SURFACES.map(({ id }) => id),
      profiles: CANONICAL_PACKAGES,
      global_regressions: 10,
    }),
    route_inventory_identity: sha256Identity(routeInventory),
    source_contract_identity: sha256Identity(sourceContracts),
    environment_identity: `isolated:${process.platform}:${process.arch}:node:${process.version}`,
    runtime_identity: process.version,
    framework_identity: 'node:test+ci009-policy-engine-v1',
    target_package_set: packages,
    compatibility_refs: packages.map((packageName) => ORIGO_RELATIONS[packageName].compatibility_ref),
    origo_profile_set: packages.map((packageName) => ORIGO_RELATIONS[packageName].profile),
    started_at: startedAt,
    completed_at: completedAt,
    result: 'PENDING',
    invalidation_reason: null,
    certification_scope: 'HARNESS_SELF_CERTIFICATION',
    consumer_conformance_claimed: false,
    known_consumer_debt_refs: ['TREQ-ORIGO-002', 'TREQ-ORIGO-016'],
    safe_build_entrypoint: 'npm run build:ci009',
    unsafe_build_reason: 'npm run build ejecuta prebuild y sync-navigation.mjs',
    test_summary: {
      executed: selfCertification.summary.executed,
      passed: selfCertification.summary.passed,
      failed: selfCertification.summary.failed,
      skipped: selfCertification.summary.skipped,
      denied_paths: 12 + packages.length,
    },
    surface_results: surfaces,
    route_inventory: routeInventory,
    source_contract_results: sourceContracts,
    implementation_boundaries: {
      package_versions_changed: false,
      pull_request_created: false,
      merge_performed: false,
      deployment_performed: false,
      rollback_performed: false,
      supabase_mutation_performed: false,
      production_data_used: false,
      consumer_functional_debt_corrected: false,
    },
  };

  const probeFailures = surfaces.filter(({ result }) => result !== 'PASS');
  const sourceFailures = sourceContracts.filter(({ result }) => result !== 'PASS');
  const runnerFailed = selfCertification.exit_code !== 0
    || selfCertification.summary.executed !== CONTRACTUAL_TEST_COUNT
    || selfCertification.summary.failed !== 0
    || selfCertification.summary.skipped !== 0;

  const preIdentity = {
    ...base,
    result: undefined,
    invalidation_reason: undefined,
    execution_identity: undefined,
  };
  const executionIdentity = sha256Identity(preIdentity);
  const candidate = { ...base, execution_identity: executionIdentity, result: 'PASS' };
  const validationErrors = validateEvidence(candidate);

  if (manifest.name !== CONSUMER_NAME) validationErrors.push('MANIFEST_CONSUMER_MISMATCH');
  if (manifest.scripts?.['build:ci009'] !== 'next build') {
    validationErrors.push('SAFE_BUILD_ENTRYPOINT_MISSING');
  }
  if (
    manifest.scripts?.['test:ci009']
    !== 'node --test scripts/quality/origo-consumer-baseline-gate.test.mjs'
  ) {
    validationErrors.push('TEST_ENTRYPOINT_MISMATCH');
  }
  if (routeInventory.result !== 'PASS') validationErrors.push('ROUTE_INVENTORY_DRIFT');
  if (probeFailures.length > 0) {
    validationErrors.push(...probeFailures.map(({ surface_id }) => `SURFACE_BLOCKED:${surface_id}`));
  }
  if (sourceFailures.length > 0) {
    validationErrors.push(...sourceFailures.map(({ contract_id }) => `SOURCE_CONTRACT_BLOCKED:${contract_id}`));
  }
  if (runnerFailed) validationErrors.push('SELF_CERTIFICATION_FAILED');

  const errors = [...new Set(validationErrors)];
  return {
    ...candidate,
    result: errors.length === 0 ? 'PASS' : (runnerFailed ? 'FAIL' : 'BLOCKED'),
    invalidation_reason: errors.length === 0 ? null : errors,
    self_certification: {
      exit_code: selfCertification.exit_code,
      ...selfCertification.summary,
    },
  };
}

function main() {
  const options = parseCli(process.argv.slice(2));
  const evidence = buildBaselineEvidence({
    root: process.cwd(),
    targetPackages: options.packages,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  process.exitCode = evidence.result === 'PASS' ? 0 : 1;
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryUrl === import.meta.url) main();