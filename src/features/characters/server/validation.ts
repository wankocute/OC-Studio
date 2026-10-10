import "server-only";

import type { z } from "zod";

import type { ValidationIssue } from "@/db/repository-errors";

/** Flatten Zod issues into the repository's `validation_failed` details. */
export function issuesOf(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}
