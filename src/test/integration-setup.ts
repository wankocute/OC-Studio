import { vi } from "vitest";

// Repositories import `server-only`, which throws outside the React Server environment.
vi.mock("server-only", () => ({}));
