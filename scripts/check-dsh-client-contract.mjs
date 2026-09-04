#!/usr/bin/env node

/**
 * Static guard for the DSH 0.1.2 web client-module contract.
 *
 * PTS client halves are classic-script factory registrations.  DSH resolves a
 * literal require only when it is a platform seed or a registered/materialized
 * client module.  The PTS profile intentionally relies only on the `react`
 * seed; any further package request must be declared in dsh.client.external.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const pluginsDir = resolve(root, 'dsh-plugins');
const PLATFORM_SEEDS = new Set(['react']);
const failures = [];
let checked = 0;

function fail(message) {
  failures.push(message);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

for (const name of readdirSync(pluginsDir).sort()) {
  const dir = resolve(pluginsDir, name);
  const manifestPath = resolve(dir, 'package.json');
  if (!statSync(dir).isDirectory() || !existsSync(manifestPath)) continue;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const client = manifest?.dsh?.client;
  if (client === undefined) continue; // host-only package
  checked += 1;

  const subject = `${manifest.name ?? name} (${relative(root, dir)})`;
  if (client === null || typeof client !== 'object' || client.platform !== 'web') {
    fail(`${subject}: dsh.client.platform must be "web"`);
    continue;
  }
  if (client.inject !== undefined && !isStringArray(client.inject)) {
    fail(`${subject}: dsh.client.inject must be a string array`);
  }
  if (client.external !== undefined && !isStringArray(client.external)) {
    fail(`${subject}: dsh.client.external must be a string array`);
  }

  const entry = manifest?.exports?.['./client'];
  if (typeof entry !== 'string' || entry.length === 0) {
    fail(`${subject}: dsh.client requires exports["./client"]`);
    continue;
  }
  const entryPath = resolve(dir, entry);
  if (!entryPath.startsWith(`${dir}\\`) && entryPath !== dir) {
    fail(`${subject}: exports["./client"] leaves its package directory`);
    continue;
  }
  if (!existsSync(entryPath)) {
    fail(`${subject}: client entry does not exist: ${relative(root, entryPath)}`);
    continue;
  }

  let source;
  try {
    source = readFileSync(entryPath, 'utf8');
    new vm.Script(source, { filename: entryPath });
  } catch (error) {
    fail(`${subject}: client entry has invalid classic-script JavaScript: ${error.message}`);
    continue;
  }
  if (!/window\.__ModuleLoader__\.load\s*\(/.test(source)) {
    fail(`${subject}: client entry must register a classic-script factory through window.__ModuleLoader__.load()`);
  }
  const registeredId = source.match(/\bid\s*:\s*["']([^"']+)["']/)?.[1];
  if (registeredId !== manifest.name) {
    fail(`${subject}: factory id ${JSON.stringify(registeredId)} must equal package name`);
  }

  const externals = new Set(client.external ?? []);
  const requirePattern = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(requirePattern)) {
    const specifier = match[1];
    if (PLATFORM_SEEDS.has(specifier) || externals.has(specifier)) continue;
    fail(`${subject}: require(${JSON.stringify(specifier)}) is neither a DSH platform seed nor declared in dsh.client.external`);
  }
}

if (failures.length > 0) {
  console.error(`DSH client-contract check failed (${failures.length} violation${failures.length === 1 ? '' : 's'}):`);
  for (const message of failures) console.error(`- ${message}`);
  process.exitCode = 1;
} else {
  console.log(`DSH client-contract check passed: ${checked} PTS web plugin${checked === 1 ? '' : 's'} verified.`);
}
