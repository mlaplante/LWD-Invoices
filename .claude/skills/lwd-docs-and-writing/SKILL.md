---
name: lwd-docs-and-writing
description: Use when writing or updating a design spec, implementation plan, or code-review report for LWD Invoices; when asked to "write up the design", "spec this out", "write an implementation plan", "document this feature", or "write up the code review"; when deciding whether a new doc belongs in docs/plans/, docs/superpowers/specs/, docs/superpowers/plans/, docs/reviews/, or tasks/todo.md and tasks/plan.md; when naming a new doc file (date-prefixed kebab-case, -design.md / -review.md suffixes); when a doc is missing a Date/Status header, a "what already exists" section, file:line citations, or a verification-ceiling caveat; or when updating README.md or CONTRIBUTING.md.
---

# LWD Docs and Writing

## Overview

Docs in this repo are load-bearing memory for engineers and AI agents who were not
in the room. The house style exists to make every doc **self-auditing**: a reader
should be able to tell, from the doc alone, what was verified vs. assumed, what
was measured vs. reasoned, and exactly which file:line a claim maps to. That
matters more than formatting polish. A doc that looks clean but hides a guess as
a fact is worse than a rough doc that flags its own uncertainty — this project has
already been burned by that (see `docs/reviews/AUDIT-2026-05.md`, "the agents
*do* hallucinate occasionally — verify every claim against the source before
acting").

This skill owns: **where docs of record live, how to name them, and the
copy-paste templates that match the house style.** It does not own what a change
is *allowed* to do, PR/commit conventions, or the idea-intake process that turns
a rough idea into a spec — those are sibling skills, linked below.

## When to use / When NOT to use

Use this skill when you are about to create or edit a design spec, implementation
plan, code-review report, `tasks/todo.md`, `tasks/plan.md`, `README.md`, or
`CONTRIBUTING.md`, or when you're unsure which directory a new doc belongs in.

Use a sibling instead when the question is:
- "What is a change *allowed* to do — does this need a migration/eval/org
  filter, and what does CI red/green actually prove?" → **lwd-change-control**
  (also owns PR template + commit conventions).
- "How does an idea become a spec in the first place — what's the intake
  process?" → **lwd-research-methodology**.
- "Why is the system shaped this way — layering, `ctx.orgId`, router/service
  boundaries?" → **lwd-architecture-contract** (cite it from your doc; don't
  restate its content in a spec).
- You need the actual accounting/invoicing domain facts to *write* into a spec
  (invoice lifecycle, DSO, 1099/W9) → **invoicing-domain-reference**.

## Doc map

| Location | Filename pattern | Holds | Status |
|---|---|---|---|
| `docs/superpowers/specs/` | `YYYY-MM-DD-<slug>-design.md` | Design specs | **Current** — use for all new specs |
| `docs/superpowers/plans/` | `YYYY-MM-DD-<slug>.md` (no `-plan` suffix) | Implementation plans, task-by-task with `- [ ]` checkboxes | **Current** — use for all new plans |
| `docs/plans/` | `YYYY-MM-DD-<slug>-design.md` / `-plan.md` | Older design docs + plans | **Legacy.** Last written 2026-04-05, superseded same day by the `docs/superpowers/` pair. Don't add new files here. |
| `docs/reviews/` | `YYYY-MM-DD-<slug>-review.md` (single-feature review); `AUDIT-YYYY-MM.md` (full-tree audit); `YYYY-MM-DD-<slug>-pass.md` (focused pass, e.g. perf) | Code-review / audit / perf-pass reports | Current — pick the sub-pattern that matches scope |
| `tasks/todo.md` + `tasks/plan.md` | fixed filenames | Live status tracker for the **one active initiative** | Only one initiative has existed so far ("Cash Flow & Money Intelligence"); whether these get replaced or archived per-initiative is **unverified** — check git history before assuming |
| `README.md` | fixed | User-facing / self-hosting doc of record. Links out to a hosted Mintlify site for full docs — that hosted site is *not* this repo's `docs/` folder; don't conflate the two. | Current |
| `CONTRIBUTING.md` | fixed | Contributor workflow doc: branch/commit conventions, code style, the 3-bucket error-handling rule | Current |

**Rule of thumb:** if you're starting a new feature initiative, your spec goes in
`docs/superpowers/specs/`, your plan in `docs/superpowers/plans/`, and (after
implementation) your review in `docs/reviews/`. Only touch `docs/plans/` if you
are amending one of its four existing legacy files.

## Naming

`YYYY-MM-DD-<kebab-slug>` — the date is when the doc was *authored*, not necessarily
when the feature ships. Slug is lowercase, hyphen-separated, no underscores. Confirm
today's date before naming a file — don't guess.

```bash
# scaffold a correctly-named, correctly-headed doc in the right directory
.claude/skills/lwd-docs-and-writing/scripts/new-doc.sh spec   <slug>
.claude/skills/lwd-docs-and-writing/scripts/new-doc.sh plan   <slug>
.claude/skills/lwd-docs-and-writing/scripts/new-doc.sh review <slug>
```
The script only decides the filename/location/header — it does not write your
content for you, and it refuses to overwrite an existing file.

## Templates

### Design spec (`docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md`)

Verified against `docs/superpowers/specs/2026-06-09-cash-flow-money-intelligence-design.md`,
`2026-04-06-profitability-milestones-forecasting-design.md`, and
`2026-06-09-tax-dashboard-client-concentration-design.md`. The exact section
names vary a little by doc (e.g. "What already exists (reality map)" vs.
"Context — what already exists"), but the **shape** is constant: header block,
a section that proves you read the existing code before proposing anything new,
architecture, and an explicit out-of-scope/schema-changes close.

```markdown
# <Feature Name>

**Date**: YYYY-MM-DD
**Status**: Draft — pending review   <!-- or: Approved / Approved (design) -->

---

## Summary

One paragraph: what this is, why now, and the headline decisions already
confirmed with the user (if any — list them).

## Context — what already exists

Verified by reading the code, not assumed. Prefer a table:

| Capability | Where | Relevance |
|---|---|---|
| ... | `some-service.ts` → `router.procedure` | which feature this unblocks |

## Architecture

- **Services** (`src/server/services/*.ts`) — pure, testable, hold the math.
- **Router** — which existing router gains procedures, or why a new one is justified.
- **UI** — new pages/components, one `SidebarNav` entry if it's a new hub.

## Data Layer / Schema changes

New/changed Prisma models or fields, or "None anticipated — reads existing models only."

## Testing

Pure functions get unit tests; router procedures get thin integration coverage
where data-shaping is non-trivial. Say which existing test's style to mirror.

## Out of scope

What this explicitly does not do, and why (e.g. "no bank integration — no stored
cash balance decision").
```

For a multi-feature initiative, repeat `Problem` / `Approach` / `Data Layer` /
`UI` / `Schema Changes` as a `### Feature N: <name>` block per feature instead of
one global Architecture section — see
`docs/superpowers/specs/2026-04-06-profitability-milestones-forecasting-design.md`
for the pattern.

### Implementation plan (`docs/superpowers/plans/YYYY-MM-DD-<slug>.md`)

Verified against `docs/superpowers/plans/2026-04-06-profitability-milestones-forecasting.md`
and `tasks/plan.md`. Note the older `docs/plans/2026-04-05-multi-org-plan.md` uses
plain `Step N` without checkboxes — that convention is superseded; use `- [ ]`
checkboxes going forward, since `tasks/todo.md` and the `superpowers:executing-plans`
/ `superpowers:subagent-driven-development` skills track progress off them.

```markdown
# <Feature Name> — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> (or superpowers:subagent-driven-development) to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md`
**Goal:** one sentence.
**Architecture:** one paragraph — which layer(s) change and why.
**Tech Stack:** name only what's actually relevant to this plan.

---

## Task N: <name>

**Files:**
- Modify/Create: `path/to/file.ts`

- [ ] **Step 1: <action>**

**Verification:**
- [ ] Tests pass: `npm run test:run -- <pattern>`
- [ ] Build succeeds: `npm run build`
- [ ] Manual: <what a human checks in a running app>

**Dependencies:** <task N, or None>
**Estimated scope:** S/M/L

---

## Verification ceiling (sandbox)

State plainly what could NOT be runtime-verified in the sandbox (no DB; `npm run
build` runs `prisma migrate deploy` first) and what a human must confirm against
a real DB/browser before this is "done". Every plan in this repo carries this
section — see `tasks/plan.md` and `tasks/todo.md` for the live example.
```

`tasks/todo.md` is the terse companion checklist derived from the plan — one
line per task with a checkbox, a one-line description of what shipped, and the
commit hash once merged (`✅ committed \`0c2aed7\``). Keep it in sync with the
plan's checkboxes as work lands; don't let them drift.

### Code-review report (`docs/reviews/YYYY-MM-DD-<slug>-review.md`)

Verified against `docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md`
(canonical) — a real prior review from this exact codebase, catching (among
other things) the `reopen` mutation's missing `organizationId` in a final
`update()`, which is now the canonical example of Non-Negotiable #1 in this
project's sibling skills. Every "Critical" and "Important" issue in the source
doc is anchored to a `**File:**` + line number and a before/after code snippet —
copy that discipline exactly.

```markdown
# Code Review: <Feature Name>
Date: YYYY-MM-DD
Commits: <hash>..<hash> (N commits)
Reviewer: <name, or "Senior Code Review">

---

## Overall Assessment

2-4 sentences: is it aligned with the spec, and is there a showstopper?

---

## What Was Done Well

Bullet list. Call out org-scoping correctness, the rounding pattern, and
transaction usage explicitly — these are the three things this project's
non-negotiables care about most, and confirming them is worth stating even
when they're fine.

---

## Critical Issues (Must Fix)

### 1. <one-line defect summary>
**File:** `path/to/file.ts`, line N

\`\`\`ts
// the offending code, verbatim
\`\`\`

Why it's wrong, in terms of the project's non-negotiables where relevant
(org-scoping, money math, migrations). Then the concrete fix:

\`\`\`ts
// the corrected code
\`\`\`

---

## Important Issues (Should Fix)

Same file:line + snippet discipline, lower severity.

---

## Suggestions (Nice to Have)

Same discipline, lowest severity — things worth a follow-up ticket, not a blocker.

---

## Plan Alignment

| Feature | Plan Alignment | Notes |
|---|---|---|
| ... | Aligned / Partial deviation / Aligned with gap | one line |

## Summary by Priority

**Must Fix (N):** ...
**Should Fix (N):** ...
**Nice to Have (N):** ...
```

For a full-tree security/quality/perf pass instead of a single-feature review,
use the `AUDIT-YYYY-MM.md` shape instead: open with scope + baseline (`tsc`
clean, N tests passing), group findings by domain, and mark each item **FIXED**
(addressed in this PR) or leave it as an unmarked roadmap entry — see
`docs/reviews/AUDIT-2026-05.md`. Its closing "How to extend this audit" section
is required reading before running another full-tree pass: it names the five
parallel domains it split into and explicitly warns that line numbers drift and
already-fixed bugs get re-reported.

## House-style rules that apply to every doc type

1. **Header block first.** Date + Status (or Date + Commits + Reviewer for a
   review) come before any prose, followed by a `---`.
2. **Status vocabulary actually used in this repo:** `Draft — pending review`,
   `Draft — pending user review`, `Draft — pending human review` (all
   equivalent — pick one and be consistent within a doc), `Approved`, `Approved
   (design)`. Never mark something "Approved" that hasn't actually been
   reviewed by a human — the whole point of the Draft state is to make that
   distinction visible.
3. **Prove you read the code before proposing new code.** Every spec has a
   section (however titled) that inventories what already exists, with a
   `Where` column pointing at a real file/procedure. If you didn't open the
   file, don't put it in that table.
4. **file:line citations in reviews are not optional.** If you can't point to
   an exact line, you haven't verified the claim — say "unverified" instead of
   guessing a line number. `AUDIT-2026-05.md` exists because this went wrong
   before.
5. **Every implementation plan carries a "Verification ceiling (sandbox)"
   section.** State exactly what `tsc --noEmit` + vitest prove and what they
   don't (see the project's Non-Negotiable #5). Never write "verified" for a
   DB/UI/perf claim you only reasoned about.
6. **Money claims cite the mechanism, not the number.** If a doc says a report
   is "correct," name what it sums (payments vs. line totals) — this project
   has a real, documented defect class here (see Critical Issue #2 in the
   profitability review: revenue computed from `line.total` instead of
   `Payment` amounts).
7. **Don't restate a sibling skill's content.** Link to it by name instead
   (e.g. "see lwd-architecture-contract for why services are pure functions").

## Common mistakes

- **Writing a new spec/plan into `docs/plans/`.** That location is legacy —
  nothing has been added there since 2026-04-05. New work goes in
  `docs/superpowers/specs/` and `docs/superpowers/plans/`.
- **Skipping the "what already exists" section** and proposing a new engine
  for something that already has one. The cash-flow-money-intelligence spec
  exists specifically because a naive read would have proposed six new
  services when five of six already existed.
- **Marking a doc "Approved" pre-emptively** to make a PR look further along
  than it is. Leave it "Draft — pending review" until an actual human signs off.
- **Reporting a line number you didn't open the file to check.** Line numbers
  drift after every commit; `AUDIT-2026-05.md` calls this out explicitly as a
  recurring failure mode of agent-authored reviews.
- **Claiming "tested" for something that only passed `tsc` + vitest in the
  sandbox.** No DB is reachable there and `npm run build` isn't runnable (it
  shells out to `prisma migrate deploy`) — that's the project's verification
  ceiling, not a formality. Say what you actually ran.
- **Letting `tasks/todo.md` drift from `tasks/plan.md`.** They describe the
  same work at two granularities; update both when a task lands.

## Provenance and maintenance

Written 2026-07-05. Verified by opening (not assuming) the following files in
this repo:
- `docs/` tree (`find docs -type f`)
- `docs/superpowers/specs/2026-06-09-cash-flow-money-intelligence-design.md`
- `docs/superpowers/specs/2026-04-06-profitability-milestones-forecasting-design.md`
- `docs/superpowers/specs/2026-06-09-tax-dashboard-client-concentration-design.md`
- `docs/superpowers/specs/2026-04-05-frictionless-payment-path-design.md`
- `docs/superpowers/plans/2026-04-06-profitability-milestones-forecasting.md`
- `docs/plans/2026-04-05-multi-org-design.md`
- `docs/plans/2026-04-05-multi-org-plan.md`
- `docs/plans/2026-04-05-quality-improvements-design.md`
- `docs/plans/2026-04-05-business-features-design.md`
- `docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md`
- `docs/reviews/AUDIT-2026-05.md`
- `docs/reviews/2026-06-24-performance-tuning-pass.md`
- `tasks/todo.md`, `tasks/plan.md`
- `README.md`, `CONTRIBUTING.md`
- `git log --diff-filter=A --format="%ad %h %s" --date=short -- docs/plans docs/superpowers` and
  `git log --diff-filter=D -- '*2026-04-02*'` (to confirm the legacy-vs-current
  status of `docs/plans/`, including that it was fully deleted once on
  2026-04-02 before being repopulated on 2026-04-05)
- `.claude/skills/lwd-change-control/SKILL.md`,
  `.claude/skills/lwd-architecture-contract/SKILL.md` (frontmatter/section
  conventions for this skill library itself)

Re-verify if things drift:
```bash
# Confirm docs/plans/ is still legacy (no new files added since 2026-04-05)
git log --diff-filter=A --format="%ad %s" --date=short -- docs/plans | sort | tail -1

# Confirm the current spec/plan directories and naming pattern
ls docs/superpowers/specs docs/superpowers/plans

# Confirm review naming variants still hold
ls docs/reviews

# Confirm tasks/ is still single-initiative (no archive directory introduced)
ls tasks/

# Re-check the exact house-style header fields in the most recent spec
head -6 "$(ls -t docs/superpowers/specs/*.md | head -1)"
```

Open uncertainty: whether `tasks/todo.md` / `tasks/plan.md` get archived,
overwritten, or renamed when the *next* initiative starts (only one initiative
exists in git history so far — "Cash Flow & Money Intelligence"). Check
`git log --oneline -- tasks/todo.md tasks/plan.md` next time a new initiative
begins and update this doc with the confirmed pattern.
