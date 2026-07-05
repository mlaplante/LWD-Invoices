#!/usr/bin/env node
// Heuristic CANDIDATE scanner for the "prove org isolation" recipe.
//
// Finds every ctx.db.<model>.{update,updateMany,delete,deleteMany,upsert}(...)
// call under src/server/routers and src/server/services, then checks whether
// "organizationId" appears within a short window of characters after the
// call. This is a textual heuristic, not a type-aware analysis:
//   - False positives happen (e.g. the filter is applied one call earlier via
//     a `getForOrg`-style helper, or a nested `where: { AND: [...] }` puts
//     organizationId outside the scan window).
//   - False negatives happen (e.g. organizationId appears in a comment).
// Treat every line below as a CANDIDATE to open and read — never as a
// verdict. This mirrors the project's own audit-doc caveat: "agents do
// hallucinate occasionally — verify every claim against the source" (see
// docs/reviews/AUDIT-2026-05.md, "How to extend this audit").
//
// Usage:
//   node .claude/skills/lwd-proof-and-analysis-toolkit/scripts/scan-write-scoping.mjs
//   node .claude/skills/lwd-proof-and-analysis-toolkit/scripts/scan-write-scoping.mjs src/server/routers/reports.ts

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../.."); // scripts -> <skill> -> skills -> .claude -> repo root

const DEFAULT_DIRS = ["src/server/routers", "src/server/services"];
const WINDOW = 240; // chars scanned after the call for "organizationId"
const CALL_RE = /ctx\.db\.\w+\.(update|updateMany|delete|deleteMany|upsert)\(/g;

function listTsFiles(dir) {
  const abs = path.join(repoRoot, dir);
  let entries;
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    const full = path.join(abs, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listTsFiles(path.relative(repoRoot, full)));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(path.relative(repoRoot, full));
    }
  }
  return out;
}

const args = process.argv.slice(2);
const files = args.length > 0 ? args : DEFAULT_DIRS.flatMap(listTsFiles);

let candidateCount = 0;
let scannedCount = 0;

for (const relFile of files) {
  const abs = path.join(repoRoot, relFile);
  let src;
  try {
    src = readFileSync(abs, "utf8");
  } catch {
    console.error(`skip (unreadable): ${relFile}`);
    continue;
  }

  for (const match of src.matchAll(CALL_RE)) {
    scannedCount++;
    const start = match.index;
    const window = src.slice(start, start + WINDOW);
    if (!window.includes("organizationId")) {
      const line = src.slice(0, start).split("\n").length;
      console.log(`CANDIDATE  ${relFile}:${line}  ${match[0]}`);
      candidateCount++;
    }
  }
}

console.log(
  `\nScanned ${scannedCount} write call(s). ${candidateCount} candidate(s) with no "organizationId" within ${WINDOW} chars.`,
);
console.log("Every candidate needs a manual read — see script header for known false-positive/negative modes.");
process.exit(0);
