#!/usr/bin/env node
/**
 * Dependency audit gate.
 *
 * Blocks on high/critical advisories in the dependencies that actually ship —
 * the production tree, which is what the runtime images install. Build-time
 * tooling (ESLint, Vite, Workbox) is audited too, but only reported: an advisory
 * in a linter cannot be exploited by a user of the deployed app, and letting it
 * fail the build trains everyone to ignore a red pipeline.
 *
 * `npm audit` has no ignore list, so advisories that are unfixable without a
 * breaking downgrade are waived explicitly in .audit-allowlist.json, each with a
 * written reason and the condition for removing it.
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

/** `npm audit` exits non-zero whenever it finds anything, so a throw is expected. */
const audit = (args) => {
  try {
    return JSON.parse(
      execFileSync('npm', ['audit', '--json', ...args], { cwd: root, encoding: 'utf8' }),
    );
  } catch (err) {
    if (!err.stdout) throw err;
    return JSON.parse(err.stdout);
  }
};

const atOrAboveThreshold = (report) =>
  Object.entries(report.vulnerabilities ?? {})
    .filter(([, vuln]) => (RANK[vuln.severity] ?? 0) >= threshold)
    .map(([name, vuln]) => ({ name, severity: vuln.severity }));

const { allow = [] } = JSON.parse(readFileSync(join(root, '.audit-allowlist.json'), 'utf8'));
const allowed = new Set(allow.map((entry) => entry.module));

const production = atOrAboveThreshold(audit(['--omit=dev']));
const everything = atOrAboveThreshold(audit([]));

const productionNames = new Set(production.map((v) => v.name));
const devOnly = everything.filter((v) => !productionNames.has(v.name));

const blocking = production.filter((v) => !allowed.has(v.name));
const waived = production.filter((v) => allowed.has(v.name));

for (const { name, severity } of waived) {
  console.log(`waived      ${severity.padEnd(8)} ${name}  (see .audit-allowlist.json)`);
}
for (const { name, severity } of devOnly) {
  console.log(`build-only  ${severity.padEnd(8)} ${name}`);
}

if (devOnly.length > 0) {
  console.log(
    `\n${devOnly.length} advisory/advisories affect build tooling only and are not in the runtime images.`,
  );
}

if (blocking.length === 0) {
  console.log(`\naudit: no unwaived runtime advisories at or above "${minLevel}".`);
  process.exit(0);
}

console.error(`\naudit: ${blocking.length} runtime advisory/advisories at or above "${minLevel}":`);
for (const { name, severity } of blocking) {
  console.error(`  ${severity.padEnd(8)} ${name}`);
}
console.error('\nFix them, or add a justified entry to .audit-allowlist.json.');
process.exit(1);
