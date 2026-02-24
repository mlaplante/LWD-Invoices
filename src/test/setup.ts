// Global test setup — add mocks here as needed
import { vi } from "vitest";

// Mock server-only so server modules can be imported in tests
vi.mock("server-only", () => ({}));
