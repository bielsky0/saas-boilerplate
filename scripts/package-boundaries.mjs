#!/usr/bin/env node
/**
 * Package boundary check (framework independence).
 *
 * Asserts the dependency DIRECTION between @repo/* packages, so backend- or
 * frontend-swaps stay possible:
 * - `api-client`, `validation`, `i18n-core` import NO @repo/* package at all
 *   (a Vue SPA vendors them verbatim — zero install cost beyond their leaves).
 * - `contracts` may import @repo/* ONLY as `import type` / `export type`
 *   (erasable at compile; same language, same consumption from Vue-TS).
 *   A runtime import would drag Drizzle into every frontend.
 * - `db` never imports `contracts` (the schema is the bottom of the stack;
 *   an upward import would be a cycle in spirit).
 *
 * Auth-SDK containment is NOT checked here — that is the eslint
 * `no-restricted-imports` rule in both apps (it understands scopes; grep
 * does not). This script owns package.json + cross-package imports only.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/+$/, "");
const PKG = (name) => join(ROOT, "packages", name);

const failures = [];
const fail = (msg) => failures.push(msg);

function tsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      tsFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Lines importing a @repo/* package at RUNTIME (not `import type`). */
function runtimeRepoImports(pkg) {
  const hits = [];
  for (const file of tsFiles(join(PKG(pkg), "src"))) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!/from\s+["']@repo\//.test(trimmed)) return;
      if (/^(import|export)\s+type\b/.test(trimmed)) return;
      hits.push(`${file.replace(ROOT + "/", "")}:${i + 1}: ${trimmed}`);
    });
  }
  return hits;
}

function anyRepoImports(pkg) {
  const hits = [];
  for (const file of tsFiles(join(PKG(pkg), "src"))) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (/from\s+["']@repo\//.test(trimmed)) hits.push(`${file.replace(ROOT + "/", "")}:${i + 1}`);
    });
  }
  return hits;
}

// 1. Leaf packages: no @repo imports, of any kind.
for (const leaf of ["api-client", "validation", "i18n-core", "billing"]) {
  for (const hit of anyRepoImports(leaf)) {
    fail(`@repo/${leaf} imports another workspace package (must stay leaf): ${hit}`);
  }
}

// 2. contracts: type-only @repo imports, and only from the allowlist.
const contractsPkg = JSON.parse(readFileSync(join(PKG("contracts"), "package.json"), "utf8"));
const allowedDeps = new Set(["@repo/db", "@repo/i18n-core"]);
for (const dep of Object.keys(contractsPkg.dependencies ?? {})) {
  if (!allowedDeps.has(dep)) {
    fail(`@repo/contracts depends on ${dep} (allowlist: ${[...allowedDeps].join(", ")})`);
  }
}
for (const hit of runtimeRepoImports("contracts")) {
  fail(`@repo/contracts has a RUNTIME cross-package import (type-only allowed): ${hit}`);
}

// 3. db never imports contracts (schema is the bottom of the stack).
for (const file of tsFiles(join(PKG("db"), "src"))) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (/@repo\/contracts/.test(line)) {
      fail(
        `@repo/db imports @repo/contracts (upward dependency): ${file.replace(ROOT + "/", "")}:${i + 1}`,
      );
    }
  });
}

if (failures.length > 0) {
  console.error("Package boundary violations:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("Package boundaries OK.");
