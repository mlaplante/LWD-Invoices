#!/usr/bin/env bash
# new-doc.sh — scaffold a new design spec, implementation plan, or review report
# in the correct docs/ location with the correct filename and a house-style header.
#
# Usage:
#   scripts/new-doc.sh spec   <slug> [docs-root]
#   scripts/new-doc.sh plan   <slug> [docs-root]
#   scripts/new-doc.sh review <slug> [docs-root]
#
# Examples:
#   scripts/new-doc.sh spec   invoice-batching
#     -> docs/superpowers/specs/2026-07-05-invoice-batching-design.md
#   scripts/new-doc.sh plan   invoice-batching
#     -> docs/superpowers/plans/2026-07-05-invoice-batching.md
#   scripts/new-doc.sh review invoice-batching
#     -> docs/reviews/2026-07-05-invoice-batching-review.md
#
# [docs-root] defaults to "docs" (repo root). Pass a scratch dir to dry-run.
#
# This only writes a template file. It does NOT decide docs/plans/ vs
# docs/superpowers/ for you — see SKILL.md "Doc map": docs/superpowers/{specs,plans}/
# is the current convention; docs/plans/ is legacy (last written 2026-04-05).
#
# Note: heredocs below are redirected straight to a file (never wrapped in
# $(...)) on purpose — some bash parsers mis-scan an apostrophe inside a
# heredoc that is itself nested in a command substitution.

set -euo pipefail

kind="${1:?usage: new-doc.sh <spec|plan|review> <slug> [docs-root]}"
slug="${2:?usage: new-doc.sh <spec|plan|review> <slug> [docs-root]}"
docs_root="${3:-docs}"
date="$(date +%Y-%m-%d)"

if [[ ! "$slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "error: slug must be lowercase-kebab-case (got: $slug)" >&2
  exit 1
fi

title="$(echo "$slug" | awk -F'-' '{for(i=1;i<=NF;i++){$i=toupper(substr($i,1,1)) substr($i,2)}; print}' OFS=' ')"

case "$kind" in
  spec)    dir="$docs_root/superpowers/specs"; file="$dir/${date}-${slug}-design.md" ;;
  plan)    dir="$docs_root/superpowers/plans"; file="$dir/${date}-${slug}.md" ;;
  review)  dir="$docs_root/reviews"; file="$dir/${date}-${slug}-review.md" ;;
  *)
    echo "error: unknown kind '$kind' (expected: spec, plan, review)" >&2
    exit 1
    ;;
esac

mkdir -p "$dir"
if [[ -e "$file" ]]; then
  echo "error: $file already exists -- not overwriting" >&2
  exit 1
fi

case "$kind" in
  spec)
    cat <<EOF > "$file"
# ${title}

**Date**: ${date}
**Status**: Draft -- pending review

---

## Summary

<!-- One paragraph: what this is and why now. -->

## Context -- what already exists

<!-- Verified by reading the code, not assumed. Table: Capability | Where | Relevance -->

## Architecture

<!-- Services / Router / UI. Name real files under src/server/services, src/server/routers, src/app. -->

## Data Layer

<!-- New/changed Prisma models or queries, if any. "None anticipated" if reads existing models only. -->

## Testing

<!-- Unit tests for new pure functions; integration coverage for non-trivial data shaping. -->

## Schema changes

<!-- "None anticipated" or list new fields/models. -->

## Out of scope

<!-- What this explicitly does not do. -->
EOF
    ;;
  plan)
    cat <<EOF > "$file"
# ${title} -- Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or
> superpowers:subagent-driven-development) to implement this plan task-by-task.
> Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Spec:** \`${docs_root}/superpowers/specs/${date}-${slug}-design.md\`
**Goal:** <!-- one sentence -->
**Architecture:** <!-- one paragraph -->
**Tech Stack:** Next.js 16 (App Router), tRPC v11, Prisma 7, TypeScript, Tailwind v4, shadcn/ui

---

## Task 1: <!-- name -->

**Files:**
- Modify/Create: \`path/to/file.ts\`

- [ ] **Step 1: <!-- action -->**

**Verification:**
- [ ] Tests pass: \`npm run test:run -- <pattern>\`
- [ ] Build succeeds: \`npm run build\`
- [ ] Manual: <!-- what a human checks in a running app -->

**Dependencies:** None
**Estimated scope:** S/M/L

---

## Verification ceiling (sandbox)

<!-- State plainly what could NOT be runtime-verified in the sandbox (no DB;
"npm run build" runs "prisma migrate deploy" first) and what a human must
confirm against a real DB/browser before this is considered done. -->
EOF
    ;;
  review)
    cat <<EOF > "$file"
# Code Review: ${title}
Date: ${date}
Commits: <!-- range, e.g. abc1234..def5678 (N commits) -->
Reviewer: <!-- name or "Senior Code Review" -->

---

## Overall Assessment

<!-- 2-4 sentences. Is it aligned with the spec? Any showstoppers? -->

---

## What Was Done Well

<!-- Bullet list. Call out org-scoping correctness, rounding pattern, transactions explicitly. -->

---

## Critical Issues (Must Fix)

### 1. <!-- one-line defect summary -->
**File:** \`path/to/file.ts\`, line N

\`\`\`ts
// offending code
\`\`\`

<!-- Why it is wrong + concrete fix, with corrected code. -->

---

## Important Issues (Should Fix)

### N. <!-- one-line summary -->
**File:** \`path/to/file.ts\`, line N

---

## Suggestions (Nice to Have)

### N. <!-- one-line summary -->

---

## Summary by Priority

**Must Fix (N):**
1. ...

**Should Fix (N):**
1. ...

**Nice to Have (N):**
1. ...
EOF
    ;;
esac

echo "wrote $file"
