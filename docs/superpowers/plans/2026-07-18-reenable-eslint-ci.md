# Re-enable ESLint in CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a working lint gate in CI by pinning ESLint to v9 (compatible with eslint-config-next 16) and re-enabling the lint step.

**Architecture:** ESLint 10 crashes because eslint-config-next's nested eslint-plugin-react calls the removed `context.getFilename()` API. ESLint 9 is fully supported by eslint-config-next 16 and was verified locally on 2026-07-18: `npx eslint .` exits 0 with 0 errors / 62 warnings (deliberate react-hooks advisories). We pin to v9, gate CI on errors only, and stop Dependabot from re-bumping to v10.

**Tech Stack:** ESLint 9 flat config (`eslint.config.mjs` already exists and works), GitHub Actions.

**Verified facts (do not re-derive):**
- `npx eslint .` with eslint@9 → exit 0, 0 errors, 62 warnings.
- `next.config.ts` does NOT contain `ignoreDuringBuilds` (the CI comment claiming it does is stale).
- The lint run currently lints `.claude/skills/**/*.mjs` helper scripts — these should be ignored.

---

### Task 1: Pin ESLint to v9

**Files:**
- Modify: `package.json` (devDependencies: `"eslint": "^10.7.0"`)
- Modify: `package-lock.json` (via npm, never by hand)

- [x] **Step 1:** Run: `npm i -D eslint@^9 --no-audit --no-fund`
- [x] **Step 2:** Verify `package.json` now has `"eslint": "^9.x.x"` and `git diff package-lock.json` only touches eslint-related entries.
- [x] **Step 3:** Run: `npx eslint --version` → expect `v9.x.x`

### Task 2: Ignore non-app scripts in eslint.config.mjs

**Files:**
- Modify: `eslint.config.mjs` (the `globalIgnores([...])` array)

- [x] **Step 1:** Add two entries to the existing `globalIgnores` array, after `".worktrees/**"`:

```js
    // Repo tooling, not app code
    ".claude/**",
    "docs/**",
```

- [x] **Step 2:** Run: `npx eslint . 2>&1 | tail -3` → expect `0 errors` (warnings OK), and no file paths under `.claude/`.

### Task 3: Re-enable the Lint step in CI

**Files:**
- Modify: `.github/workflows/ci.yml` (the `check` job, currently lines 27–33)

- [x] **Step 1:** Replace the stale 3-line comment block (`# Lint is disabled until ...` through `# next.config.ts also has ...`) with a real step between "Type check" and "Test":

```yaml
      # ESLint is pinned to v9: eslint-config-next 16's nested eslint-plugin-react
      # crashes under ESLint 10 (context.getFilename removed). Revisit when
      # eslint-config-next supports ESLint 10.
      - name: Lint
        run: npm run lint
```

- [x] **Step 2:** Run: `npx --yes actionlint@latest .github/workflows/ci.yml || ./actionlint .github/workflows/ci.yml` (if actionlint unavailable locally, YAML-parse check: `node -e "require('js-yaml')" 2>/dev/null || npx yaml-lint` is NOT required — CI's actionlint job will validate; just ensure indentation matches surrounding steps exactly: 6 spaces before `-`).

### Task 4: Stop Dependabot from re-bumping ESLint to v10

**Files:**
- Modify: `.github/dependabot.yml` (npm ecosystem block)

- [x] **Step 1:** Add an `ignore` key to the npm update block (same indent level as `groups`):

```yaml
    ignore:
      # ESLint 10 is incompatible with eslint-config-next 16 (nested
      # eslint-plugin-react crash). Remove once eslint-config-next supports it.
      - dependency-name: "eslint"
        update-types: ["version-update:semver-major"]
```

### Task 5: Verify and commit

- [x] **Step 1:** Run: `npm run lint` → exit 0, `0 errors`.
- [x] **Step 2:** Run: `npx tsc --noEmit` → exit 0 (no type regressions from the dependency change).
- [x] **Step 3:** Commit:

```bash
git add package.json package-lock.json eslint.config.mjs .github/workflows/ci.yml .github/dependabot.yml
git commit -m "ci: re-enable ESLint gate on v9 pin

ESLint 10 crashes via eslint-config-next's nested eslint-plugin-react
(context.getFilename removed). Pin to v9, lint in CI (errors fail,
warnings tolerated), ignore future eslint major bumps in Dependabot."
```

If the commit fails with a sandbox `.git` permission error, leave the files staged, report the exact `git add` list above, and CONTINUE to any remaining tasks — do not abort.
