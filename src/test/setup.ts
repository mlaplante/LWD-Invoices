// Global test setup — add mocks here as needed
import { vi } from "vitest";

// Set test environment variables before any modules are loaded
(process.env as any).NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";
process.env.RESEND_API_KEY ??= "test_key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test_key";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test_key";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.GATEWAY_ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// Mock server-only so server modules can be imported in tests
vi.mock("server-only", () => ({}));
