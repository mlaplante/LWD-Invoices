// Point git at the repo's tracked hooks directory so githooks/pre-commit (the
// gitleaks secret scan) fires on every clone without a manual
// `git config core.hooksPath githooks` step. Runs from the `prepare` npm
// lifecycle, i.e. on every `npm install` / `npm ci`.
//
// Must never fail the install: a tarball checkout, a CI image without git, or
// a sandbox without a .git directory just means there is no local hook to wire.
import { execFileSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

try {
  git(["rev-parse", "--is-inside-work-tree"]);
  let current = "";
  try {
    current = git(["config", "--get", "core.hooksPath"]);
  } catch {
    // unset — fall through and set it
  }
  if (current !== "githooks") {
    git(["config", "core.hooksPath", "githooks"]);
    console.log("[setup-git-hooks] core.hooksPath set to githooks (gitleaks pre-commit scan)");
  }
} catch {
  // Not a git checkout — nothing to do.
}
