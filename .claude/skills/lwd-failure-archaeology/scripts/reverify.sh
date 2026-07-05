#!/usr/bin/env bash
# Re-verify the load-bearing claims in lwd-failure-archaeology/SKILL.md against
# the current working tree. Run from the repo root:
#   bash .claude/skills/lwd-failure-archaeology/scripts/reverify.sh
#
# This does NOT prove anything is bug-free — it only checks whether the
# specific facts this skill cites are still true. If a check fails, the
# SKILL.md entry it maps to needs a status update (see "Provenance and
# maintenance" at the bottom of SKILL.md).

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
pass=0
fail=0

check() {
  local desc="$1" cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "OK   - $desc"
    pass=$((pass + 1))
  else
    echo "FAIL - $desc"
    fail=$((fail + 1))
  fi
}

echo "== Non-negotiable #2: migrations still wired into the Netlify build =="
check "netlify.toml build command runs 'prisma migrate deploy'" \
  "grep -q 'prisma migrate deploy' netlify.toml"

echo
echo "== Settled: milestone reopen/update/delete are org-scoped (2026-04-06 review, fixed) =="
check "milestones.ts reopen's final update() includes organizationId" \
  "grep -A3 'reopen: protectedProcedure' -A20 src/server/routers/milestones.ts | grep -q 'organizationId: ctx.orgId'"

echo
echo "== Settled: UserOrganization is the sole org-access source (no app_metadata fallback) =="
check "trpc.ts context has no app_metadata org/role fallback (comment mentioning it is fine; code reading it is not)" \
  "! grep -q 'app_metadata?.organizationId\|app_metadata?.userRole' src/server/trpc.ts"

echo
echo "== STILL OPEN as of 2026-07-05: profitabilityByProject revenue uses line.total, not payments =="
echo "   (profitabilityByClient uses Payment.amount — the two views are still inconsistent)"
check "reports.ts profitabilityByProject still sums InvoiceLine.total under paidStatuses incl. SENT/PARTIALLY_PAID" \
  "grep -q 'paidStatuses: string\[\] = \[\"PAID\", \"SENT\", \"PARTIALLY_PAID\"\]' src/server/routers/reports.ts"

echo
echo "== Settled: revenueForecast includes OVERDUE invoices (2026-04-06 review, fixed) =="
check "reports.ts revenueForecast status filter includes OVERDUE" \
  "grep -q '\"SENT\", \"PARTIALLY_PAID\", \"OVERDUE\"' src/server/routers/reports.ts"

echo
echo "== Settled: cross-instance webhook dedup landed (AUDIT-2026-05 S3/S4) =="
check "webhook-dedup service exists" \
  "test -f src/server/services/webhook-dedup.ts"

echo
echo "-----"
echo "$pass passed, $fail flagged for re-check against SKILL.md"
exit 0
