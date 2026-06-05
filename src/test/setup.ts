// Global test setup — add mocks here as needed
import { vi } from "vitest";

// Set test environment variables before any modules are loaded.
// NODE_ENV is typed read-only, so assign through a cast to keep `tsc` happy.
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";
process.env.RESEND_API_KEY ??= "test_key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test_key";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test_key";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.OPENAI_API_KEY ??= "test-openai-key";
process.env.RECEIPT_OCR_PROVIDER ??= "openai";
process.env.GATEWAY_ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// Mock server-only so server modules can be imported in tests
vi.mock("server-only", () => ({}));

// next/cache requires the Next runtime (incremental cache + static generation
// store). Under vitest neither is bound, so any unstable_cache/revalidateTag
// call throws. Replace them with passthroughs so cached helpers behave like
// plain async functions in tests.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: () => undefined,
  revalidatePath: () => undefined,
}));
