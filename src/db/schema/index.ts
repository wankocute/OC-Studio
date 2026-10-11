// Drizzle schema entry point. Tables follow docs/database-design.md.
// Stored templates are intentionally absent until they are specified. AI tables hold only
// short-lived job state (see runtime.ts), never an archive of generations.
export * from "./characters";
export * from "./library";
export * from "./library-definitions";
export * from "./profiles";
export * from "./runtime";
