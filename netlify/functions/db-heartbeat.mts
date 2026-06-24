import type { Config } from "@netlify/functions";
import pg from "pg";

const handler = async () => {
  const siteUrl =
    Netlify.env.get("URL") ??
    Netlify.env.get("DEPLOY_PRIME_URL") ??
    Netlify.env.get("NEXT_PUBLIC_APP_URL");
  const warmupSecret = Netlify.env.get("WARMUP_SECRET");

  if (siteUrl && warmupSecret) {
    try {
      const warmup = await fetch(new URL("/api/warmup", siteUrl), {
        headers: { "x-warmup-secret": warmupSecret },
        cache: "no-store",
      });

      if (!warmup.ok) {
        console.warn("[db-heartbeat] App warmup returned", warmup.status);
      } else {
        console.log("[db-heartbeat] App warmup OK");
      }
      return;
    } catch (err) {
      console.error("[db-heartbeat] App warmup failed:", err);
    }
  }

  const client = new pg.Client({
    connectionString: Netlify.env.get("DATABASE_URL"),
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
    console.log("[db-heartbeat] OK");
  } catch (err) {
    console.error("[db-heartbeat] Failed:", err);
  } finally {
    await client.end().catch(() => {});
  }
};

export default handler;

export const config: Config = {
  // Keep the Netlify Next function and Supabase pooler path warm during idle gaps.
  schedule: "*/15 * * * *",
};
