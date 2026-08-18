import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_PACKAGES,
  CONSUMER_REPOSITORY,
  CONTRACTUAL_TEST_COUNT,
  EXPECTED_PAGE_FILES,
  EXPECTED_ROUTE_HANDLERS,
  ORIGO_RELATIONS,
  REQUIRED_EVIDENCE_FIELDS,
  SURFACES,
  containsSensitiveData,
  evaluateProfile,
  evaluateSurface,
  evidenceIsStale,
  resolveTargetPackages,
  sha256Identity,
  validateEvidence,
  validateRouteInventoryEntries,
} from './origo-consumer-baseline-gate.mjs';

const positiveSurfaceScenarios = Object.freeze({
  'ORIGO-SURFACE-001': {
    session: true,
    app_access: true,
    permission: true,
    auth_error: false,
    expired: false,
  },
  'ORIGO-SURFACE-002': {
    site_id: 'SITE-001',
    actor_effective: 'EMP-001',
    resource_scope_valid: true,
    manipulated: false,
    override_authorized: true,
    shared_device: true,
    actor_signed: true,
  },
  'ORIGO-SURFACE-003': {
    page_count: 13,
    unique_page_count: 13,
    dynamic_page_count: 3,
    handler_count: 1,
    synced_route_count: 12,
    menu_candidate_count: 4,
    handler_registered: true,
    handler_counted_as_page: false,
    protected_direct_access: true,
  },
  'ORIGO-SURFACE-004': {
    supplier_id: 'SUP-001',
    supplier_active: true,
    relationship_attributable: true,
    commercial_data_attributable: true,
    duplicate_supplier: false,
  },
  'ORIGO-SURFACE-005': {
    product_id: 'PROD-001',
    product_active: true,
    presentation_id: 'UOM-001',
    presentation_belongs_to_product: true,
    conversion_factor: 12,
    supplier_linked: true,
  },
  'ORIGO-SURFACE-006': {
    supplier_id: 'SUP-001',
    site_id: 'SITE-001',
    line_count: 2,
    quantities_valid: true,
    presentations_valid: true,
    costs_valid: true,
    total_reconciled: true,
  },
  'ORIGO-SURFACE-007': {
    authorized: true,
    resource_scope_valid: true,
    transition_legal: true,
    edit_state_valid: true,
    delete_policy_valid: true,
  },
  'ORIGO-SURFACE-008': {
    document_order_match: true,
    secret_required: true,
    secret_fallback: false,
    service_role_after_validation: true,
    token_valid: true,
    authenticated_access: false,
  },
  'ORIGO-SURFACE-009': {
    supplier_id: 'SUP-001',
    site_id: 'SITE-001',
    entry_mode: 'purchase_order',
    line_count: 2,
    destination_valid: true,
    purchase_order_id: 'PO-001',
  },
  'ORIGO-SURFACE-010': {
    operation_id: 'RECEIPT-001',
    idempotency_key: 'IDEMP-001',
    atomic_or_reconciliable: true,
    duplicate_effect: false,
    costs_attributable: true,
    stock_attributable: true,
    correction_safe: true,
  },
  'ORIGO-SURFACE-011': {
    contract_consumed: true,
    claimed_owner: 'procurement',
  },
  'ORIGO-SURFACE-012': {
    server_render: true,
    client_render: true,
    hydration_mismatch: false,
    interaction_ok: true,
    forms_ok: true,
    accessibility_ok: true,
    export_authorized: true,
    export_smoke_ok: true,
  },
});

const negativeSurfaceScenarios = Object.freeze({
  'ORIGO-SURFACE-001': {
    session: false,
    app_access: true,
    permission: true,
    auth_error: false,
    expired: false,
  },
  'ORIGO-SURFACE-002': {
    site_id: 'SITE-001',
    actor_effective: 'EMP-001',
    resource_scope_valid: false,
    manipulated: true,
    override_authorized: false,
    shared_device: true,
    actor_signed: false,
  },
  'ORIGO-SURFACE-003': {
    page_count: 12,
    unique_page_count: 12,
    dynamic_page_count: 2,
    handler_count: 1,
    synced_route_count: 11,
    menu_candidate_count: 3,
    handler_registered: false,
    handler_counted_as_page: true,
    protected_direct_access: false,
  },
  'ORIGO-SURFACE-004': {
    supplier_id: 'SUP-001',
    supplier_active: false,
    relationship_attributable: false,
    commercial_data_attributable: false,
    duplicate_supplier: true,
  },
  'ORIGO-SURFACE-005': {
    product_id: 'PROD-001',
    product_active: true,
    presentation_id: 'UOM-OTHER',
    presentation_belongs_to_product: false,
    conversion_factor: 0,
    supplier_linked: false,
  },
  'ORIGO-SURFACE-006': {
    supplier_id: '',
    site_id: '',
    line_count: 0,
    quantities_valid: false,
    presentations_valid: false,
    costs_valid: false,
    total_reconciled: false,
  },
  'ORIGO-SURFACE-007': {
    authorized: false,
    resource_scope_valid: false,
    transition_legal: false,
    edit_state_valid: false,
    delete_policy_valid: false,
  },
  'ORIGO-SURFACE-008': {
    document_order_match: false,
    secret_required: true,
    secret_fallback: true,
    service_role_after_validation: false,
    token_valid: false,
    authenticated_access: false,
  },
  'ORIGO-SURFACE-009': {
    supplier_id: 'SUP-001',
    site_id: 'SITE-001',
    entry_mode: 'purchase_order',
    line_count: 0,
    destination_valid: false,
    purchase_order_id: '',
  },
  'ORIGO-SURFACE-010': {
    operation_id: 'RECEIPT-001',
    idempotency_key: '',
    atomic_or_reconciliable: false,
    duplicate_effect: true,
    costs_attributable: false,
    stock_attributable: false,
    correction_safe: false,
  },
  'ORIGO-SURFACE-011': {
    contract_consumed: true,
    claimed_owner: 'inventory',
  },
  'ORIGO-SURFACE-012': {
    server_render: true,
    client_render: true,
    hydration_mismatch: true,
    interaction_ok: false,
    forms_ok: false,
    accessibility_ok: false,
    export_authorized: false,
    export_smoke_ok: false,
  },
});

const positiveProfiles = Object.freeze({
  '@vento/contracts': {
    types_compile: true,
    payload_shapes_checked: true,
    serialization_checked: true,
    identifier_semantics_preserved: true,
    no_global_cast_bypass: true,
  },
  '@vento/os-context': {
    session_checked: true,
    site_resource_context_checked: true,
    permission_allow_checked: true,
    permission_deny_checked: true,
    shared_device_signature_checked: true,
    client_cannot_elevate_authority: true,
  },
  '@vento/supabase': {
    browser_client_checked: true,
    server_client_checked: true,
    permission_rpc_checked: true,
    deny_path_checked: true,
    isolated_schema_source: true,
    no_service_role_fixture: true,
    build_does_not_sync_navigation: true,
  },
  '@vento/ui-web': {
    server_render_checked: true,
    client_render_checked: true,
    hydration_checked: true,
    forms_checked: true,
    accessibility_checked: true,
    pdf_export_checked: true,
  },
});

for (const surface of SURFACES) {
  test(`POS ${surface.id} ${surface.name}`, () => {
    assert.equal(evaluateSurface(surface.id, positiveSurfaceScenarios[surface.id]), true);
  });
}

for (const surface of SURFACES) {
  test(`NEG ${surface.id} ${surface.name} falla cerrado`, () => {
    assert.equal(evaluateSurface(surface.id, negativeSurfaceScenarios[surface.id]), false);
  });
}

for (const packageName of CANONICAL_PACKAGES) {
  test(`PROFILE POS ${packageName}`, () => {
    assert.equal(evaluateProfile(packageName, positiveProfiles[packageName]), true);
  });
}

for (const packageName of CANONICAL_PACKAGES) {
  test(`PROFILE NEG ${packageName} no acepta cobertura incompleta`, () => {
    const incomplete = { ...positiveProfiles[packageName] };
    const firstKey = Object.keys(incomplete)[0];
    incomplete[firstKey] = false;
    assert.equal(evaluateProfile(packageName, incomplete), false);
  });
}

function validEvidence() {
  const targetPackageSet = [...CANONICAL_PACKAGES];
  const identity = sha256Identity('fixture');
  return {
    consumer_repository: CONSUMER_REPOSITORY,
    consumer_branch: 'main',
    consumer_base_commit: '1'.repeat(40),
    consumer_manifest_identity: identity,
    consumer_lockfile_identity: identity,
    test_contract_identity: identity,
    test_suite_identity: identity,
    fixture_set_identity: identity,
    route_inventory_identity: identity,
    source_contract_identity: identity,
    environment_identity: 'isolated:win32:x64:node:v24.19.0',
    runtime_identity: 'v24.19.0',
    framework_identity: 'node:test+ci009-policy-engine-v1',
    target_package_set: targetPackageSet,
    compatibility_refs: targetPackageSet.map(
      (packageName) => ORIGO_RELATIONS[packageName].compatibility_ref,
    ),
    origo_profile_set: targetPackageSet.map(
      (packageName) => ORIGO_RELATIONS[packageName].profile,
    ),
    execution_identity: identity,
    started_at: '2026-08-17T23:09:00-05:00',
    completed_at: '2026-08-17T23:10:00-05:00',
    result: 'PASS',
    invalidation_reason: null,
    certification_scope: 'HARNESS_SELF_CERTIFICATION',
    consumer_conformance_claimed: false,
    safe_build_entrypoint: 'npm run build:ci009',
    implementation_boundaries: {
      supabase_mutation_performed: false,
      production_data_used: false,
    },
    test_summary: {
      executed: CONTRACTUAL_TEST_COUNT,
      passed: CONTRACTUAL_TEST_COUNT,
      failed: 0,
      skipped: 0,
      denied_paths: 16,
    },
  };
}

test('REG-01 evidencia válida tiene todos los campos contractuales', () => {
  const evidence = validEvidence();
  for (const field of REQUIRED_EVIDENCE_FIELDS) assert.ok(field in evidence);
  assert.deepEqual(validateEvidence(evidence), []);
});

test('REG-02 cero tests jamás se normaliza a PASS', () => {
  const evidence = validEvidence();
  evidence.test_summary.executed = 0;
  assert.ok(validateEvidence(evidence).includes('ZERO_REQUIRED_TESTS'));
});

test('REG-03 evidencia de otro consumidor jamás satisface ORIGO', () => {
  const evidence = validEvidence();
  evidence.consumer_repository = 'devVentoGroup/vento-fogo';
  assert.ok(validateEvidence(evidence).includes('WRONG_CONSUMER_REPOSITORY'));
});

test('REG-04 cambiar commit vuelve STALE la evidencia', () => {
  const previous = validEvidence();
  const current = { ...previous, consumer_base_commit: '2'.repeat(40) };
  assert.equal(evidenceIsStale(previous, current), true);
});

test('REG-05 cambiar target package set vuelve STALE la evidencia', () => {
  const previous = validEvidence();
  const current = {
    ...previous,
    target_package_set: ['@vento/contracts'],
    compatibility_refs: ['PKG-COMP-MX-005'],
    origo_profile_set: ['ORIGO-PROFILE-CONTRACTS'],
  };
  assert.equal(evidenceIsStale(previous, current), true);
});

test('REG-06 entorno productivo queda bloqueado', () => {
  const evidence = validEvidence();
  evidence.environment_identity = 'production:remote';
  assert.ok(validateEvidence(evidence).includes('PRODUCTION_ENVIRONMENT_FORBIDDEN'));
});

test('REG-07 secretos reales o con forma de secreto quedan bloqueados', () => {
  assert.equal(containsSensitiveData({ password: 'synthetic-fixture-password-12345678' }), true);
});

test('REG-08 conjunto multi-package conserva orden canónico y perfiles exactos', () => {
  assert.deepEqual(
    resolveTargetPackages('@vento/ui-web,@vento/contracts,@vento/supabase'),
    ['@vento/contracts', '@vento/supabase', '@vento/ui-web'],
  );
});

test('REG-09 inventario exacto acepta 13 páginas, 3 dinámicas, 1 handler, 12 sincronizables y 4 menús', () => {
  const result = validateRouteInventoryEntries(EXPECTED_PAGE_FILES, EXPECTED_ROUTE_HANDLERS);
  assert.equal(result.result, 'PASS');
  assert.equal(result.actual_page_count, 13);
  assert.equal(result.unique_page_count, 13);
  assert.equal(result.actual_dynamic_page_count, 3);
  assert.equal(result.actual_handler_count, 1);
  assert.equal(result.actual_synced_route_count, 12);
  assert.equal(result.actual_menu_candidate_count, 4);
});

test('REG-10 inventario con drift de páginas o handlers queda bloqueado', () => {
  const pages = EXPECTED_PAGE_FILES.filter((entry) => entry !== 'src/app/page.tsx');
  pages.push('src/app/extra/page.tsx');
  const handlers = [...EXPECTED_ROUTE_HANDLERS, 'src/app/api/extra/route.ts'];
  const result = validateRouteInventoryEntries(pages, handlers);
  assert.equal(result.result, 'BLOCKED');
  assert.ok(result.missing_pages.includes('src/app/page.tsx'));
  assert.ok(result.unexpected_pages.includes('src/app/extra/page.tsx'));
  assert.ok(result.unexpected_handlers.includes('src/app/api/extra/route.ts'));
});