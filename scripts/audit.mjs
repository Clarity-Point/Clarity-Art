#!/usr/bin/env node
/**
 * Dependency audit gate.
 *
 * `npm audit` has no ignore list, so a single unfixable transitive advisory would
 * either wedge CI permanently or force the check to be disabled outright. This
 * wrapper fails on every high/critical advisory except the ones explicitly
 * accepted in .audit-allowlist.json, each with a written reason.
 *
 * Usage: node scripts/audit.mjs [--level=high]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const levelArg = process.argv.find((a) => a.startsWith('--level='));
const minLevel = levelArg ? levelArg.split('=')[1] : 'high';

const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const threshold = RANK[minLevel] ?? RANK.high;

// `npm audit` exits non-zero when it finds anything, so failure here is expected.
let raw;
try {
  raw = execFileSync('npm', ['audit', '--json'], { cwd: root, encoding: 'utf8' });
} catch (err) {
  raw = err.stdout;
}

if (!raw) {
  console.error('audit: npm produced no output');
  process.exit(1);
}

const report = JSON.parse(raw);
const { allow = [] } = JSON.parse(readFileSync(join(root, '.audit-allowlist.json'), 'utf8'));
const allowed = new Set(allow.map((entry) => entry.module));

const blocking = [];
const waived = [];

for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  if ((RANK[vuln.severity] ?? 0) < threshold) continue;
  (allowed.has(name) ? waived : blocking).push({ name, severity: vuln.severity });
}

for (const { name, severity } of waived) {
  console.log(`waived  ${severity.padEnd(8)} ${name}  (see .audit-allowlist.json)`);
}

if (blocking.length === 0) {
  console.log(`\naudit: no unwaived advisories at or above "${minLevel}".`);
  process.exit(0);
}

console.error(`\naudit: ${blocking.length} advisory/advisories at or above "${minLevel}":`);
for (const { name, severity } of blocking) {
  console.error(`  ${severity.padEnd(8)} ${name}`);
}
console.error('\nFix them, or add a justified entry to .audit-allowlist.json.');
process.exit(1);
