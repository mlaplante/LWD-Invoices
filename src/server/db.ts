import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import "server-only";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const isProd = process.env.NODE_ENV === "production";
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // Serverless: cap at 1 connection per invocation so we don't exhaust
    // Supabase's connection limit. Use the transaction pooler URL (port 6543)
    // in production to route through PgBouncer instead of direct connections.
    max: isProd ? 1 : 10,
    // Keep the connection warm for the life of the (warm) function instance.
    // node-postgres defaults idleTimeoutMillis to 10s, which closes the socket
    // 10s after a request — so the next request on a still-warm instance pays
    // the full TCP+TLS+auth setup again. 0 disables idle reaping so repeat
    // requests reuse the established connection. Paired with max:1 in prod this
    // means at most one long-lived connection per instance.
    idleTimeoutMillis: isProd ? 0 : 10_000,
    // Enable TCP keepalive so the socket isn't silently dropped by NAT /
    // Supavisor between requests during idle gaps.
    keepAlive: true,
  });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

// Pre-warm the connection at module load (cold start) so the TCP+TLS handshake
// and Postgres/PgBouncer auth happen in parallel with the rest of cold-start
// work and the first React render — instead of blocking the first real query.
// Fire-and-forget: failures here are harmless (the real query will surface any
// genuine connection error) and must not crash module evaluation.
if (process.env.NODE_ENV === "production") {
  void db.$queryRaw`SELECT 1`.catch(() => {});
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
