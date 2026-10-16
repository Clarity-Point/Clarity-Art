import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function runGate(report, args = [], productionReport = report) {
  const root = mkdtempSync(join(tmpdir(), 'clarity-audit-test-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'bin'));
    copyFileSync(new URL('./audit.mjs', import.meta.url), join(root, 'scripts/audit.mjs'));
    writeFileSync(join(root, '.audit-allowlist.json'), '{"allow":[]}');
    writeFileSync(
      join(root, 'bin/npm'),
      '#!/bin/sh\ncase "$*" in *--omit=dev*) printf "%s" "$AUDIT_PRODUCTION_FIXTURE" ;; *) printf "%s" "$AUDIT_FIXTURE" ;; esac\nexit "$AUDIT_EXIT"\n',
      { mode: 0o700 },
    );
    return spawnSync(process.execPath, [join(root, 'scripts/audit.mjs'), ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${join(root, 'bin')}:${process.env.PATH}`,
        AUDIT_FIXTURE: JSON.stringify(report),
        AUDIT_PRODUCTION_FIXTURE: JSON.stringify(productionReport),
        AUDIT_EXIT: report.error ? '1' : '0',
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('audit gate accepts a complete clean report', () => {
  assert.equal(runGate({ metadata: {}, vulnerabilities: {} }).status, 0);
});
test('audit gate fails closed on registry errors and incomplete reports', () => {
  assert.notEqual(runGate({ error: { code: 'E503' } }).status, 0);
  assert.notEqual(runGate({ metadata: {} }).status, 0);
});
test('audit gate blocks high severity in the full dependency tree', () => {
  const result = runGate(
    {
      metadata: {},
      vulnerabilities: { tool: { severity: 'high', range: '*' } },
    },
    [],
    { metadata: {}, vulnerabilities: {} },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /build-tooling advisories/);
});
test('audit gate rejects misspelled severity thresholds', () => {
  assert.notEqual(runGate({ metadata: {}, vulnerabilities: {} }, ['--level=typo']).status, 0);
});
