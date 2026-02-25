import type { Config } from "@netlify/functions";
import pg from "pg";

export default async (_req: Request) => {
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

export const config: Config = {
  // Every 5 minutes
  schedule: "*/5 * * * *",
};
