#!/usr/bin/env bash
# security-census.sh — re-measure the facts cited in
# lwd-security-and-secrets/SKILL.md. Run from the repo root:
#   bash .claude/skills/lwd-security-and-secrets/scripts/security-census.sh
# Read-only; makes no changes. Being a standalone script file (not sourced
# into an interactive shell) it bypasses this repo's `rtk` grep/find hook,
# which truncates piped output in the interactive shell and can undercount
# (see lwd-architecture-contract's "Measurement gotcha" note) — do not
# re-run these checks as bare interactive `grep ... | wc -l` commands.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "== Encryption: callers of encryptJson/encryptString/decryptJson/decryptString =="
echo "   (confirms what's actually encrypted at rest, not just the docstring example)"
grep -rln "encryptJson\|encryptString\|decryptJson\|decryptString" src --include="*.ts" \
  | grep -v "src/server/services/encryption.ts" | grep -v "\.test\.ts$"

echo
echo "== Encryption keyring env vars wired into src/lib/env.ts (Zod-validated)? =="
grep -n "GATEWAY_ENCRYPTION_KEY\b\|GATEWAY_ENCRYPTION_KEYS\|PORTAL_SESSION_SECRET" src/lib/env.ts

echo
echo "== WebhookDelivery model present (cross-instance webhook dedup)? =="
grep -n "model WebhookDelivery" -A 6 prisma/schema.prisma

echo
echo "== Webhook signature verification present? =="
echo "--- src/app/api/webhooks/stripe/route.ts delegates to stripe-webhook-validator.ts ---"
grep -n "validateStripeWebhook" src/app/api/webhooks/stripe/route.ts || echo "  NOT FOUND — stripe route no longer validates via the shared helper"
grep -n "constructStripeEvent" src/server/services/stripe-webhook-validator.ts || echo "  NOT FOUND — signature check may have moved/regressed"
for f in src/app/api/webhooks/resend/route.ts src/app/api/webhooks/inbound-email/route.ts; do
  echo "--- $f ---"
  grep -n "new Webhook(\|\.verify(" "$f" || echo "  NOT FOUND — signature check may have moved/regressed"
done

echo
echo "== Private storage buckets (public: false) vs public bucket count =="
grep -rn "public: false\|public: true" src/lib/supabase-storage.ts src/server/services/storage.ts src/lib/supabase/storage.ts 2>/dev/null

echo
echo "== netlify.toml: portal/pay cache headers still no-store? (non-negotiable-adjacent) =="
grep -n "for = \"/portal/\*\"\|for = \"/pay/\*\"" -A 2 netlify.toml

echo
echo "== INNGEST_SIGNING_KEY required in production (AUDIT-2026-05 S7 — should be fixed) =="
grep -n "INNGEST_SIGNING_KEY is required in production" src/lib/env.ts || echo "MISSING — S7 regressed, see AUDIT-2026-05.md"

echo
echo "== bcryptjs cost factor for portal passphrases (AUDIT-2026-05 S9 — currently 12, roadmap says bump to 13) =="
grep -n "bcrypt.hash(" src/server/routers/clients.ts

echo
echo "== gitleaks: CI workflow + local pre-commit hook present? =="
test -f .github/workflows/gitleaks.yml && echo "CI: .github/workflows/gitleaks.yml present"
test -f githooks/pre-commit && cat githooks/pre-commit

echo
echo "== UPSTASH_REDIS_REST_URL/TOKEN referenced in code but validated in env.ts? (should be: referenced, NOT validated — Tier 3, see lwd-config-and-flags) =="
grep -rln "UPSTASH_REDIS_REST" src --include="*.ts" | grep -v test
grep -n "UPSTASH" src/lib/env.ts || echo "(not in env.ts — confirms Tier 3 / silent no-op risk)"
