#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repository = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
let stale = false;
for (const name of ["scripts/exchange.mjs", "references/EXCHANGE.md"]) {
  const source = join(repository, "skills/engineering/prompt-engineer", name);
  const target = join(repository, "skills/engineering/implement", name);
  if (existsSync(target) && readFileSync(source).equals(readFileSync(target))) continue;
  stale = true;
  if (!check) { mkdirSync(dirname(target), { recursive: true }); copyFileSync(source, target); }
}
if (check && stale) {
  console.error("Implement's exchange bundle is stale. Run node scripts/sync-exchange.mjs.");
  process.exit(1);
}
console.log(stale ? "Exchange bundle synchronized." : "Exchange bundle is in sync.");
