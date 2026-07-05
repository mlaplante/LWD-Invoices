---
name: lwd-failure-archaeology
description: Use when about to re-investigate something that smells like it was already fought over — org-scoping ("organizationId") leaks, "column X does not exist" 500s after a Netlify deploy, netlify.toml build-command changes, invoices stuck as OVERDUE that shouldn't be, profitability/forecast numbers that don't match between tabs, a stale/orphaned git branch you're deciding whether to merge or delete, or before trusting an "AUDIT"/"review" doc's file:line claims at face value. Also use when opening docs/reviews/*.md or picking up a roadmap item, to check whether it was already fixed, rejected, or superseded since the doc was written.
---

# LWD Failure Archaeology

## Overview

This project has a written history of things that were tried, broke, got reverted,
got re-fixed, or were deliberately rejected. That history lives scattered across
`git log`, `docs/reviews/*.md`, and code comments — nobody has read all of it in
one sitting except whoever is about to re-discover it the hard way.

**Core principle: a settled fight has a commit hash. An open fight does not.**
Before you re-diagnose something, check the table below. If it has a commit hash
and a "Settled" status, the fix already landed — look for *why it might have
regressed*, don't re-derive the fix from scratch. If it says "Still open" or
"Rejected", that's not an oversight for you to silently correct — it's a decision
someone made for a reason (usually written next to it). Change it only if you
have new information the original decision didn't have.

This skill is a chronicle, not a live dashboard. Entries can go stale the moment
someone ships a new commit. Re-verify before you rely on a specific claim — see
`scripts/reverify.sh` and the re-verification commands at the bottom.

## When to use / when NOT to use

Use this skill when you catch yourself about to re-investigate a symptom that
sounds architectural or historical (deploy breakage, org-leak pattern, invoice
status weirdness, "didn't we already fix this?"). Skim the table first.

Do **not** use this skill for:
- **How** to do org-scoping correctly going forward → `lwd-architecture-contract`.
- **How** the invoice/payment/tax domain model works → `invoicing-domain-reference`.
- **How** to actually debug a live bug step by step → `lwd-debugging-playbook`.
- **What** netlify.toml / env vars / feature flags currently mean → `lwd-config-and-flags`.
- **Reviewing or landing a new change** (PR checklist, revert etiquette) → `lwd-change-control`.
- **Running/operating** the app day to day → `lwd-run-and-operate`.
- Money-math and AI-eval discipline specifics → `money-intelligence-campaign`.

If you're not sure whether your symptom is "new" or "a rerun of history," spend
five minutes here first — it's cheaper than re-fixing a bug that has a name.

---

## The chronicle: Symptom → Root cause → Evidence → Status

### 1. Netlify build silently stopped running migrations → live DB drifted behind schema.prisma
**Rank: #1 costliest failure class in this project's history.**

| | |
|---|---|
| Symptom | Random `"column X does not exist"` 500s on pages that read a newly-added column, appearing only in production, never locally. |
| Root cause | `netlify.toml`'s `[build].command` **replaces** `package.json`'s build script entirely — it does not extend it. If `prisma migrate deploy` isn't literally inside that command string, Netlify never runs pending migrations, even though `prisma migrate deploy` might exist elsewhere (CI, package.json) and look "covered." |
| Evidence | Chronology, all in `netlify.toml` history: `114d646` (2026-04-02 15:34) added `prisma migrate deploy` to fix exactly this symptom (`isActive` column missing) and *also* wrapped the isActive check in try/catch as a defensive fallback. One minute later, `f4e70cb` (2026-04-02 15:35) **reverted** the migrate-deploy addition with message "DB unreachable from Netlify" — the build itself started failing because Netlify couldn't reach the database at build time. `prisma migrate deploy` was then missing from every deploy for **over five weeks** until `45bbd55` (2026-05-09) restored it for good. |
| Status | **Settled**, but fragile by construction. Current `netlify.toml` carries a load-bearing comment explaining exactly this trap (see below) — do not remove `prisma migrate deploy` from the build command, and do not assume "it's fine, CI runs migrations" — CI does not deploy. |
| Open question | *Why* the DB was unreachable from the Netlify build environment on 2026-04-02 is not documented in-repo beyond the commit message. `prisma.config.ts`'s `DIRECT_DATABASE_URL` / session-pooler preference predates this incident (it was already in the codebase at Release v1.0.0), so the connectivity gap was not simply "wrong connection string not yet added" — treat the exact mechanism as **unverified**. If you hit DB-unreachable-at-build-time again, check Supabase network restrictions / Netlify's egress IPs first, not the connection-string shape. |

The defensive try/catch from `114d646` is *still in the code* (`src/app/(dashboard)/layout.tsx`, wraps the `isActive` lookup) even though migrations are now reliably applied — kept as belt-and-suspenders. Don't remove it as "dead code"; it's cheap insurance against the exact failure mode above recurring.

```toml
# Current netlify.toml (verified 2026-07-05):
[build]
  # IMPORTANT: keep `prisma migrate deploy` in this command. netlify.toml
  # overrides package.json's build script entirely, so omitting it skips
  # migrations on deploy and the live DB drifts behind schema.prisma.
  # Symptom is "column X does not exist" 500s on any page that reads
  # the new column.
  command = "prisma generate && prisma migrate deploy && next build"
```

For what the build command means today, cross-reference `lwd-config-and-flags` /
`lwd-build-and-env`; this entry only owns the historical "why is this comment here."

---

### 2. Stale Supabase `app_metadata` let removed users keep org access
| | |
|---|---|
| Symptom | A user removed from an organization (their `UserOrganization` row deleted) could still act as if they belonged to it. |
| Root cause | `createTRPCContext` had a fallback: if no `UserOrganization` membership was found, it read `orgId`/`userRole` from the Supabase JWT's `app_metadata` instead of failing closed. `app_metadata` is set at some point in the past and does not get invalidated when membership rows are deleted — it's a stale cache with no revocation path. |
| Evidence | `eca51e1` "Security audit round 3: portal PDF auth, session expiry, org fallback removal." Diff removed the `else` branch reading `user?.app_metadata?.organizationId` / `.userRole` and replaced it with the comment now in `src/server/trpc.ts`: *"UserOrganization is the sole source of truth for org access. The old app_metadata fallback let users removed from an org (membership row deleted) keep full access via stale Supabase metadata."* |
| Status | **Settled.** `UserOrganization` (resolved via `resolveMembership` in `src/server/user-context.ts`) is now the only path to `ctx.orgId`. If you ever see code reading `app_metadata` for authorization, that is a regression of this exact bug — revert it, don't "improve" it. |

This was one of three security-audit rounds (`891add0` round 1/DRY refactor,
`d453b3a` round 2, `eca51e1` round 3) that hardened auth/session/tenant boundaries
incrementally — see `d453b3a`'s message for a second, adjacent example: hashing
client-portal session tokens at rest, because the plaintext token had been stored
directly in `ClientPortalSession.token` (a DB read/backup leak, not a code-path bug).

---

### 3. Two distinct flavors of org-scoping leak — know which one you're looking for

The non-negotiable ("every query MUST filter by `organizationId`") has **two**
failure shapes in this codebase's history, not one. Confusing them wastes time.

**Shape A — the final write itself is missing the org filter.**
A `findUnique`/`findFirst` upstream *does* check `organizationId: ctx.orgId`, but
a later `update`/`delete` in the same procedure keys only on `{ id: input.id }`.
If the earlier read raced or a refactor split the check from the write, the
write has no tenant guard at all.

- Evidence: `docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md`,
  finding #1 — `src/server/routers/milestones.ts` `reopen` (and, same pattern,
  `update` and `delete`) originally wrote `where: { id: input.id }` only.
- Status: **Settled.** Verified 2026-07-05 — all three (`update` line ~58,
  `delete` line ~75, `reopen` line ~185) now use
  `where: { id: input.id, organizationId: ctx.orgId }`.

**Shape B — the new/updated row is org-scoped, but a *foreign id in the input*
(a `clientId`, `projectId`, etc. the caller supplied) was never checked to
belong to that org.** Writing `{ clientId: input.clientId, organizationId: ctx.orgId }`
only scopes the row being written — it does nothing to stop the caller
referencing another org's client/project by id (a cross-tenant IDOR).

- Evidence: `f7f22b1` "fix(security): validate cross-tenant client references on
  invoice/ticket writes (#56)" added `assertInOrg()` to `src/server/lib/get-for-org.ts`,
  with this doc-comment (verified verbatim in source):
  > "writing `{ clientId: input.clientId, organizationId: ctx.orgId }` on a new
  > row only scopes the *new* row; it never checks that the referenced client is
  > in the same tenant. Skipping this check lets a caller reference another
  > org's record by id (cross-tenant read/write)."
- Status: **Settled for invoices/tickets/proposals** (the three routers that
  call `assertInOrg`, 6 call sites total as of 2026-07-05). Not a
  repo-wide guarantee — `assertInOrg` is a tool you must remember to reach for
  on every new foreign-key-shaped input field, the same way `getForOrg` is a
  tool and not an automatic guarantee (AUDIT-2026-05 item A4 notes only ~21 of
  ~347 org-filtered call sites use `getForOrg` at all; most are still hand-written
  inline `where` clauses).

When you add a mutation that accepts *any* id belonging to another model
(`clientId`, `projectId`, `retainerId`, `invoiceId`...), ask "shape A or shape B
or both" — then check whether `getForOrg`/`assertInOrg` already covers it before
hand-rolling a check. See `lwd-architecture-contract` for the pattern going
forward; this entry only owns "here's the two ways it broke before."

---

### 4. `profitabilityByProject` still counts unpaid revenue — flagged 2026-04-06, NOT fixed as of 2026-07-05

This is the one entry in this file you should NOT assume is settled just because
it appears in a code-review doc with a "fix approach" written next to it.

| | |
|---|---|
| Symptom | The Profitability report's Project tab and Client tab disagree on revenue for the same underlying activity — Client tab revenue is lower / lags behind Project tab. |
| Root cause | `profitabilityByProject` (`src/server/routers/reports.ts`) computes revenue as `SUM(InvoiceLine.total)` for lines on invoices with `status IN ('PAID','SENT','PARTIALLY_PAID')` — i.e. it counts the full invoiced amount the moment an invoice is sent, not what's actually been paid. `profitabilityByClient`, right next to it in the same file, computes revenue as `SUM(Payment.amount)` — actual cash received. Per non-negotiable #3 ("money comes from Payment allocations, not pre-allocation line totals"), the Project tab is the one that's wrong. |
| Evidence | Flagged in `docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md`, "Critical Issues #2," with the exact fix approach: *"restrict `paidStatuses` to `[\"PAID\"]` only, which makes project revenue consistent with the client-level view."* Re-verified in source 2026-07-05: `profitabilityByProject` still declares `const paidStatuses: string[] = ["PAID", "SENT", "PARTIALLY_PAID"];` and still sums `il.total` (raw SQL, `SUM(il.total)`), while `profitabilityByClient` sums `p.amount` from `"Payment" p`. The router was rewritten to raw `$queryRaw` SQL sometime after the review (no more `Map`-based JS aggregation, per an updated code comment), but the rewrite preserved the same bug rather than fixing it. |
| Status | **Still open.** Do not assume a "code review happened" implies "code review findings were applied" — verify per-finding, every time. If you're touching `profitabilityByProject`, this is the one fix actually worth doing while you're in there; the review's suggested fix (cap `paidStatuses` to `["PAID"]`) is still valid against current source. |

Other findings from the same review, re-verified 2026-07-05, for the same reason
(don't trust a review doc's status without re-checking):

| Finding | Status (verified 2026-07-05) |
|---|---|
| #3 `revenueForecast` excluded `OVERDUE` invoices | **Fixed** — `status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] }` present. |
| #4 `tx as never` cast in milestone `complete` (should be `tx as unknown as PrismaClient`) | **Still open** — `src/server/routers/milestones.ts` line ~106 still casts `tx as never`. Cosmetic/type-safety only, not a runtime bug. |
| #5 expense cost date filter uses `createdAt` not a billing/incurred date | **Still open** in both `profitabilityByClient` and `profitabilityByProject` — both filter expenses on `e."createdAt"`. |
| #7 no loop-safety counter in `revenueForecast`'s recurring-projection `while` loop | **Still open** — loop is bounded by `runAt <= horizon` (a finite date), so it's low-risk, not infinite, but still no defensive iteration cap if `computeNextRunAt` ever regresses to a non-advancing date. |
| #8 hardcoded `$` prefix in `MilestoneList.tsx` amount display | **Still open** — `${Number(m.amount).toFixed(2)}` at `src/components/projects/MilestoneList.tsx` line ~59. Cosmetic, non-USD orgs affected. |
| #9 auto-invoice from milestone uses org default currency, not project's currency | **Still open** — `milestones.ts` `complete` still fetches `tx.currency.findFirst({ organizationId: ctx.orgId, isDefault: true })` rather than the project's `currencyId`. |

---

### 5. Rejected fix: "just add `take:` caps to unbounded report queries"

| | |
|---|---|
| Symptom / temptation | `docs/reviews/AUDIT-2026-05.md` and `docs/reviews/2026-06-24-performance-tuning-pass.md` both flag a family of unbounded (`no take:`) queries in `reports.ts` (`unpaidInvoices`, `overdueInvoices`, `expenseBreakdown`, `invoiceAging`, `timeTracking`, `utilization`, `retainerLiability`) and `retainers.burndown` as perf risks. The obvious-looking fix is "cap them with `take: N`, same as any other list." |
| Why it was rejected | These procedures **aggregate or bucket the entire result set** (sums, bucket totals, ratios) — they are not paginated lists. A `take:` cap doesn't limit a page of rows the user scrolls through; it silently truncates the input to a sum, producing a wrong total that looks plausible. This is the "displayed total is a stale subset-sum, not a math error" trap (see also `displayed-total-not-subset-sum-means-stale-not-mismath` in the wider skills library) — applied here proactively as a design constraint, not caught as a bug after the fact. |
| Evidence | `docs/reviews/2026-06-24-performance-tuning-pass.md`, "Implemented in this pass," item A.3/A.4: *"a bare `take:` would silently corrupt the financial reports (they sum/bucket every row), so those were **not** capped… Not paginated, by correctness (documented, not skipped)."* The one genuinely unbounded **list** in that audit pass, `tickets.list`, *was* converted to cursor pagination — because it's a list, not an aggregate. |
| Status | **Deliberately rejected as a class**, correctly. If you're asked to "speed up the reports page" by capping these queries, don't — the fix (if profiling ever proves it's needed) is server-side pre-aggregation (materialized view / rollup table) or a mandatory date-window guard, never a row cap on a sum. |

That same doc's opening line is itself a standing warning worth repeating
verbatim, because it names this project's verification ceiling (non-negotiable
#5) precisely: *"This pass was done in a sandbox with no database and where
`npm run build` is not runnable... Every finding below is reasoned and
type-checked (`tsc` clean), not measured... The 'measure first' rule applies —
these are candidates, ranked by structural risk, not proven regressions."*
Two items in that same doc (A.1 collections N+1, A.2 project-health N+1) were
converted from "candidate" to "implemented" *in that same pass*, verified only
by `tsc` + the 2110-test suite passing — **not** by a profiler against real
data, because none was available. Treat those two as "shipped but runtime-unverified"
until someone profiles them against production-shaped data.

---

### 6. Self-healing revert: invoices wrongly marked OVERDUE before an installment guard existed

| | |
|---|---|
| Symptom | Installment invoices (partial-payment schedules) flipped to `OVERDUE` status even though their *next* scheduled installment wasn't due yet — only the invoice's top-level `dueDate` had passed. |
| Root cause, part 1 (the bug) | The overdue cron (`src/inngest/functions/overdue-invoices.ts`) originally checked only the invoice's own `dueDate`, ignoring that `PARTIALLY_PAID` invoices with installments should check the *next unpaid installment's* due date instead. |
| Fix, part 1 | `89613c1` "fix: skip overdue notification for partially paid invoices with future installments" added the installment-aware guard going forward — invoices created/processed after this commit are marked OVERDUE correctly. |
| Root cause, part 2 (the residue) | The guard only prevents *new* misclassifications. Invoices already wrongly flipped to `OVERDUE` before `89613c1` deployed stayed wrong forever — there was no backfill. |
| Fix, part 2 | `d3b2111` "fix: self-healing revert of incorrectly overdue installment invoices" — the same cron now also scans for `OVERDUE` invoices whose next unpaid installment isn't due yet and reverts them back to `PARTIALLY_PAID`, every run. This makes the cron idempotent/self-correcting instead of requiring a one-off backfill script. |
| Evidence | Both commits touch only `src/inngest/functions/overdue-invoices.ts`; verified 2026-07-05 both code paths (the guard at invoice-marking time, and the revert-scan at cron start) are present in current source. |
| Status | **Settled.** This is a good pattern to reuse: when a status-machine bug is fixed going forward, ask whether existing rows need the same cron to *also* repair them, rather than a separate one-off migration script. |

---

### 7. `git log --all` will show you two "dead" branches — they are not equally dead

`origin/claude/kind-noether-15or6e` and `origin/claude/missing-features-brainstorm-cnd4yi`
never got fast-forward-merged into `main`. Naively concluding "dead branch, safe
to delete, work is lost" is **wrong for one of the two** — verified 2026-07-05:

| Branch | Tip commit | Contains | Status |
|---|---|---|---|
| `origin/claude/kind-noether-15or6e` | `f7ef7bf` (dunning retries) | Dunning/failed-payment recovery, PWA support, ACH/SEPA Stripe payment methods, cross-instance webhook dedup hardening | **Superseded, not lost.** None of `f7ef7bf`, `d28eb2b` (PWA), `57462d1` (ACH/SEPA), or `b389131` (webhook dedup) is an ancestor of `main` — but their *content* landed anyway, squash-merged under different commit hashes: `a72623a` "Add dunning (failed-payment recovery) system with PWA support (#66)" contains the same `webhook-dedup.ts`, `dunning-retries.ts`, ACH/SEPA `stripe.ts` changes verified present in current `main`. The branch itself is safe to delete; do not attempt to merge it — you'd be re-merging content already on `main` under a different history. |
| `origin/claude/missing-features-brainstorm-cnd4yi` | `671b0da` | `docs/reviews/2026-06-10-feature-gap-brainstorm.md` (brainstorm doc only, no code) | **Genuinely orphaned.** This file does not exist anywhere in `main`'s tree; `671b0da` is not an ancestor of `main`. If the brainstorm content (bank feeds, accounting export/sync, competitor importers, ACH/direct-debit, client self-service billing) is still wanted, it must be pulled from this branch explicitly — `git show 671b0da:docs/reviews/2026-06-10-feature-gap-brainstorm.md`. Nothing else references it. |

Lesson: `git merge-base --is-ancestor <tip> main` tells you whether a branch's
*commits* landed. It does not tell you whether the branch's *content* landed
under a squash-merge with a different hash. Check the file tree / grep for a
signature symbol (a function or table name from the branch), not just ancestry,
before declaring work lost.

---

### 8. Audit/review docs hallucinate file:line — verify every claim before acting

`docs/reviews/AUDIT-2026-05.md` says this about itself, verbatim, in "How to
extend this audit": *"The agents do hallucinate occasionally — verify every
claim against the source before acting... agent line numbers can be off by a
few, and agents may report behaviour that was already fixed in recent commits
as if it were still broken."*

This is not hypothetical — section 4 of this file is a live example: several
"AUDIT-2026-05" roadmap items (S3/S4 webhook dedup, S7 `INNGEST_SIGNING_KEY`
required in prod) were independently fixed by *later* commits not in that
document, and this file had to re-check each one against current source rather
than trusting the doc's own status. **Every entry in this chronicle was itself
re-verified against source on 2026-07-05** — treat any future addition to this
file the same way: don't transcribe a review doc's claim, re-derive it from the
file it cites.

---

## Common mistakes

- **Trusting a review doc's "Fixed"/"roadmap" framing without re-grepping the source.** Docs don't auto-update when code changes later. Section 4 and 8 above exist because of this exact trap.
- **Treating `git merge-base --is-ancestor` as proof content was lost.** Squash-merges land content under a new hash — check the file tree, not just ancestry (section 7).
- **"Fixing" the try/catch around `isActive` in the dashboard layout as dead code.** It's cheap insurance against migration-timing failures, not a code smell (section 1).
- **Adding a `take:` cap to a reports/aggregate query to "fix" a perf audit finding.** That's the rejected fix in section 5 — it produces a wrong total, not a faster correct one.
- **Assuming org-scoping is one bug shape.** Missing `organizationId` on the final write (shape A) and un-validated foreign-key references (shape B) are different bugs with different fixes — see section 3.
- **Re-fixing `profitabilityByProject`'s revenue calc as if it were newly discovered.** It's known, it's in a review doc, and it's still broken (section 4) — the fix is already written down, just not applied yet.

---

## Provenance and maintenance

Date-stamped: 2026-07-05. Every claim above was verified against the files below
on this date by opening them directly (not from memory or from another skill).

**Files verified:**
- `git log --all --oneline` (50 commits reachable across all refs) and targeted `git show`/`git log -1 --format='%B'` on: `f4e70cb`, `114d646`, `45bbd55`, `d3b2111`, `89613c1`, `eca51e1`, `d453b3a`, `891add0`, `b389131`, `f7f22b1`, `a72623a`, `671b0da`, `307b026`.
- `netlify.toml` (current build command + comment).
- `prisma.config.ts` (DIRECT_DATABASE_URL preference, confirmed present since Release v1.0.0).
- `docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md` (full read).
- `docs/reviews/AUDIT-2026-05.md` (full read).
- `docs/reviews/2026-06-24-performance-tuning-pass.md` (full read).
- `src/server/trpc.ts` (`createTRPCContext`, `protectedProcedure`).
- `src/server/lib/get-for-org.ts` (`getForOrg`, `assertInOrg`).
- `src/server/routers/milestones.ts` (all `update`/`delete`/`reopen`/`complete` call sites).
- `src/server/routers/reports.ts` (`profitabilityByClient`, `profitabilityByProject`, `revenueForecast`).
- `src/inngest/functions/overdue-invoices.ts` (installment guard + self-heal scan).
- `src/app/(dashboard)/layout.tsx` (isActive try/catch).
- `src/components/projects/MilestoneList.tsx` (hardcoded `$`).
- `git branch -a` / `git ls-remote --heads origin` / `git merge-base --is-ancestor` for the two dead-looking branches.

**Re-verification commands** (run from repo root; also bundled in `scripts/reverify.sh`):
```bash
# Section 1 — migrations still in the build command
grep -n "prisma migrate deploy" netlify.toml

# Section 2 — no app_metadata org/role fallback
grep -n "app_metadata" src/server/trpc.ts   # should only appear in the explanatory comment

# Section 3 — org-scoping shapes A and B still guarded
grep -n "organizationId: ctx.orgId" src/server/routers/milestones.ts
grep -rn "assertInOrg(" src/server/routers/ | wc -l   # 6 call sites across 3 files on 2026-07-05 (use the "(" to exclude import lines)

# Section 4 — is profitabilityByProject still using line totals?
grep -n 'paidStatuses' src/server/routers/reports.ts

# Section 5 — reports queries still deliberately uncapped
grep -n "take:" src/server/routers/reports.ts   # absence on the aggregate procedures is intentional

# Section 6 — self-healing revert still present
grep -n "revert\|nextUnpaid" src/inngest/functions/overdue-invoices.ts

# Section 7 — branch ancestry re-check
git ls-remote --heads origin
git merge-base --is-ancestor f7ef7bf main && echo ancestor || echo not-ancestor
```

**Uncertainties (labeled, not resolved):**
- The exact technical cause of "DB unreachable from Netlify" on 2026-04-02 (section 1) is not documented in-repo beyond the commit message; do not assume it was a `DIRECT_DATABASE_URL`/IPv6 issue without new evidence, since that config predates the incident.
- `assertInOrg` call-site count (6, across `invoices.ts`/`tickets.ts`/`proposals.ts`) will drift as new mutations are added — treat the number as a 2026-07-05 snapshot, not a target. Count call sites with `grep "assertInOrg("` (the `(` excludes import lines).
