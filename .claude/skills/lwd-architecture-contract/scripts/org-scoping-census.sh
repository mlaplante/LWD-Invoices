#!/usr/bin/env bash
# org-scoping-census.sh — re-measure the org-scoping blast radius described in
# lwd-architecture-contract/SKILL.md. Run from the repo root:
#   bash .claude/skills/lwd-architecture-contract/scripts/org-scoping-census.sh
# Read-only; makes no changes. Being a standalone script file (not sourced into
# an interactive shell) it bypasses this repo's `rtk` grep/find hook, which
# truncates piped output in the interactive shell and can undercount — see the
# "Measurement gotcha" note in SKILL.md's Provenance section.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "== tRPC routers merged in _app.ts =="
grep -c "^import.*Router" src/server/routers/_app.ts

echo
echo "== Prisma models =="
grep -c "^model " prisma/schema.prisma

echo
echo "== Inline 'organizationId:' occurrences under src/server (the manual org-scoping pattern) =="
grep -rn "organizationId:" src/server --include="*.ts" | wc -l | tr -d ' '

echo
echo "== getForOrg() call sites (scoped single-row FETCH, not foreign-id validation) — count + files =="
grep -rn "getForOrg(" src --include="*.ts" | grep -v "src/server/lib/get-for-org.ts" | wc -l | tr -d ' '
grep -rl "getForOrg(" src --include="*.ts" | grep -v "src/server/lib/get-for-org.ts"

echo
echo "== assertInOrg() call sites (caller-supplied foreign-id VALIDATION before write) — count + files =="
echo "   NB: this is a DIFFERENT guarantee from getForOrg() above — don't merge the two counts,"
echo "   a prior SKILL.md revision swapped which files use which helper by doing exactly that."
grep -rn "assertInOrg(" src --include="*.ts" | grep -v "src/server/lib/get-for-org.ts" | wc -l | tr -d ' '
grep -rl "assertInOrg(" src --include="*.ts" | grep -v "src/server/lib/get-for-org.ts"

echo
echo "== 'as unknown as PrismaClient' casts (AUDIT-2026-05 item A3 — should shrink over time) =="
grep -rln "as unknown as PrismaClient" src/server --include="*.ts" || echo "(none found)"

echo
echo "== Cross-org / multi-tenant leakage test files (AUDIT-2026-05 item A5 — currently expected to be EMPTY) =="
find src \( -iname "*multi-tenant*" -o -iname "*cross-org*" -o -iname "*leakage*" \) 2>/dev/null || true

echo
echo "== Line counts for the two oversized routers flagged in AUDIT-2026-05 (A1, A2) =="
wc -l src/server/routers/invoices.ts src/server/routers/reports.ts

echo
echo "== netlify.toml build command still runs prisma migrate deploy? (must say yes — non-negotiable #2) =="
grep -n "migrate deploy" netlify.toml || echo "MISSING — this is a P0, see lwd-architecture-contract non-negotiable #2"
