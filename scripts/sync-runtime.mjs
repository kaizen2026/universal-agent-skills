#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repository = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(repository, ".agents", "universal-agent-skills", "runtime");
const target = join(repository, "skills", "engineering", "setup-universal-agent-skills", "scripts", "runtime");
const check = process.argv.includes("--check");
const names = ["core.mjs", "adapters.mjs", "cli.mjs"];

if (!check) mkdirSync(target, { recursive: true });

let stale = false;
for (const name of names) {
  const sourcePath = join(source, name);
  const targetPath = join(target, name);
  const matches = existsSync(targetPath) && readFileSync(sourcePath).compare(readFileSync(targetPath)) === 0;
  if (matches) continue;
  stale = true;
  if (!check) copyFileSync(sourcePath, targetPath);
}

if (check && stale) {
  console.error("Bundled setup runtime is stale. Run `node scripts/sync-runtime.mjs`.");
  process.exit(1);
}

console.log(stale ? "Bundled setup runtime synchronized." : "Bundled setup runtime is in sync.");
