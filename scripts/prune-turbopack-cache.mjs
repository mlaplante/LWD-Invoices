// Prune stale Turbopack filesystem-cache versions before a Netlify build.
//
// Turbopack's persistent build cache (.next/cache/turbopack, enabled via
// experimental.turbopackFileSystemCacheForBuild) keys its contents by Next.js
// version: one ~600MB subdirectory per version, e.g. "v16.3.0-d73f5622". A
// new Next version never reuses an old version's directory, but the old
// directory stays behind — and because @netlify/plugin-nextjs persists all of
// .next/cache between builds, every dependency bump adds another dead ~600MB
// to the saved cache. That bloat makes Netlify's cache save/restore slower and
// pushes the cache toward eviction, which shows up as permanently cold builds.
//
// This script deletes every turbopack cache subdirectory that does not match
// the currently installed Next version. It runs between the plugin's cache
// restore (onPreBuild) and `next build`, and it must NEVER fail the build:
// any error just skips pruning.
import { readdirSync, rmSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

try {
  const require = createRequire(import.meta.url);
  const nextVersion = require("next/package.json").version;
  const cacheDir = join(process.cwd(), ".next", "cache", "turbopack");
  if (!existsSync(cacheDir)) {
    console.log(`[prune-turbopack-cache] no cache at ${cacheDir}, nothing to do`);
    process.exit(0);
  }
  const keepPrefix = `v${nextVersion}-`;
  for (const entry of readdirSync(cacheDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(keepPrefix)) {
      console.log(`[prune-turbopack-cache] keeping ${entry.name} (current Next ${nextVersion})`);
    } else {
      rmSync(join(cacheDir, entry.name), { recursive: true, force: true });
      console.log(`[prune-turbopack-cache] removed stale ${entry.name}`);
    }
  }
} catch (err) {
  console.warn(`[prune-turbopack-cache] skipped: ${err?.message ?? err}`);
}
process.exit(0);
