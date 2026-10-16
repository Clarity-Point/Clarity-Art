#!/usr/bin/env node
/**
 * Dependency audit gate.
 *
 * Blocks on high/critical advisories in the dependencies that actually ship —
 * the production tree, which is what the runtime images install — and on
 * high/critical advisories anywhere in the tree, because vulnerable build tooling is
 * still a supply-chain risk for anyone running the toolchain.
 *
 * `npm audit` has no ignore list, so advisories that are unfixable without a
 * breaking downgrade are waived explicitly in .audit-allowlist.json, each with a
 * written reason and the condition for removing it.
 *
 * The gate is deliberately strict in three ways:
 *   1. A waiver that no longer matches a real advisory FAILS the build. A fix
 *      landing upstream must not leave a permanent exemption behind.
 *   2. High/critical advisories fail even when they are build-only.
 *   3. Production high/critical advisories fail unless waived.
 *
 * Usage: node scripts/audit.mjs [--level=high] [--dev-level=high]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const flag = (name, fallback) => {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : fallback;
};

const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const threshold = (level) => {
  if (!(level in RANK)) throw new Error(`Unknown audit severity: ${level}`);
  return RANK[level];
};

const prodLevel = flag('level', 'high');
const devLevel = flag('dev-level', 'high');
const prodThreshold = threshold(prodLevel);
const devThreshold = threshold(devLevel);

/** `npm audit` exits non-zero whenever it finds anything, so a throw is expected. */
const parseReport = (output) => {
  const report = JSON.parse(output);
  if (report.error || !report.metadata || !report.vulnerabilities) {
    throw new Error('npm audit did not return a complete vulnerability report');
  }
  return report;
};

const audit = (args) => {
  try {
    return parseReport(
      execFileSync('npm', ['audit', '--json', ...args], {
        cwd: root,
        encoding: 'utf8',
        timeout: 120_000,
        maxBuffer: 16 * 1024 * 1024,
      }),
    );
  } catch (err) {
    if (!err.stdout) throw err;
    return parseReport(err.stdout);
  }
};

const collect = (report, minSeverity) =>
  Object.entries(report.vulnerabilities ?? {})
    .filter(([, vuln]) => (RANK[vuln.severity] ?? 0) >= minSeverity)
    .map(([name, vuln]) => ({ name, severity: vuln.severity, range: vuln.range }));

const { allow = [] } = JSON.parse(readFileSync(join(root, '.audit-allowlist.json'), 'utf8'));
for (const entry of allow) {
  if (!entry.module || !entry.reason?.trim() || !entry.review?.trim()) {
    throw new Error('Each audit waiver requires module, reason and review');
  }
}
const allowed = new Set(allow.map((entry) => entry.module));

const productionReport = audit(['--omit=dev']);
const everythingReport = audit([]);

const production = collect(productionReport, prodThreshold);
const everything = collect(everythingReport, devThreshold);

const productionNames = new Set(production.map((v) => v.name));
const devOnly = everything.filter((v) => !productionNames.has(v.name));

const blocking = production.filter((v) => !allowed.has(v.name));
// Build-tooling advisories fail too: they cannot be exploited through
// a deployed image, but they are still a supply-chain risk for anyone running
// the toolchain (a malicious glob or a file-read gadget in a test runner).
const devBlocking = devOnly.filter((v) => !allowed.has(v.name));
const devBlockingNames = new Set(devBlocking.map((v) => v.name));
const waived = [...production, ...devOnly].filter((v) => allowed.has(v.name));

for (const { name, severity } of waived) {
  console.log(`waived      ${severity.padEnd(8)} ${name}  (see .audit-allowlist.json)`);
}
for (const { name, severity } of devOnly) {
  if (!devBlockingNames.has(name)) {
    console.log(`build-only  ${severity.padEnd(8)} ${name}`);
  }
}

/*
 * A waiver is a promise to remove it. If the advisory it names is gone, the
 * entry is stale and the exemption is now unjustified — fail rather than let a
 * silent, permanent hole accumulate in the allowlist.
 */
const stillFlagged = new Set([
  ...collect(productionReport, 0).map((v) => v.name),
  ...collect(everythingReport, 0).map((v) => v.name),
]);
const stale = allow.map((entry) => entry.module).filter((name) => !stillFlagged.has(name));

const failures = [];

if (blocking.length > 0) {
  console.error(
    `\naudit: ${blocking.length} runtime advisory/advisories at or above "${prodLevel}":`,
  );
  for (const { name, severity } of blocking) {
    console.error(`  ${severity.padEnd(8)} ${name}`);
  }
  console.error('\nFix them, or add a justified entry to .audit-allowlist.json.');
  failures.push('runtime advisories');
}

if (devBlocking.length > 0) {
  console.error(
    `\naudit: ${devBlocking.length} build-tooling advisory/advisories at or above "${devLevel}":`,
  );
  for (const { name, severity } of devBlocking) {
    console.error(`  ${severity.padEnd(8)} ${name}`);
  }
  failures.push('build-tooling advisories');
}

if (stale.length > 0) {
  console.error(
    '\naudit: .audit-allowlist.json contains entries that no longer match any advisory:',
  );
  for (const name of stale) console.error(`  ${name}`);
  console.error('The underlying advisory is fixed — remove the waiver.');
  failures.push('stale allowlist entries');
}

if (devOnly.length > 0 && !failures.includes('build-tooling advisories')) {
  console.log(
    `\n${devOnly.length} advisory/advisories affect build tooling only and are below the`,
  );
  console.log(`build-tooling threshold ("${devLevel}"). They are not in the runtime images.`);
}

if (failures.length > 0) {
  console.error(`\naudit FAILED: ${failures.join(', ')}.`);
  process.exit(1);
}

console.log(
  `\naudit: clean — no unwaived runtime advisories at or above "${prodLevel}",` +
    ` none at or above "${devLevel}" anywhere, and no stale waivers.`,
);
process.exit(0);
