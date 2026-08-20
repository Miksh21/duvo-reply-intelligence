import { z } from "zod";

/**
 * Pre-meeting brief — produced by Claude (the generative model; a human reads
 * this) from Exa search results plus the deal context captured in Trigger A.
 *
 * Mirrors §4 of the build brief verbatim. The `evidence_quality` flag is the
 * honesty valve: if Exa returned little, say "thin" and say so in the paragraph
 * rather than fabricate.
 */
export const BriefSchema = z.object({
  brief_paragraph: z.string(), // <=120 words, dense, specific, grounded in Exa results
  discovery_framework: z.array(z.string()).length(5), // exactly 5, keyed to THIS prospect
  sources: z
    .array(
      z.object({
        title: z.string(),
        url: z.string(),
      }),
    )
    .length(3), // 3, taken from Exa results
  meddpicc_updates: z.object({
    // optional refinements surfaced by research; null if none
    metrics: z.string().nullable(),
    economic_buyer: z.string().nullable(),
    decision_criteria: z.string().nullable(),
    competition: z.string().nullable(),
  }),
  evidence_quality: z.enum(["strong", "thin"]), // honest flag; "thin" if Exa returned little
});

export type Brief = z.infer<typeof BriefSchema>;

/**
 * Thin-evidence variant: when Exa returns fewer than 3 results total, we can't
 * honestly produce 3 sources. This relaxes the source count (and the caller
 * forces evidence_quality: "thin") rather than fabricating to hit the number.
 * The strong path still uses the exact-3 BriefSchema above.
 */
export const BriefSchemaThin = BriefSchema.extend({
  sources: z
    .array(z.object({ title: z.string(), url: z.string() }))
    .max(3),
});

/**
 * The 3 Exa queries Claude generates before searching. Q1 = account initiative,
 * Q2 = persona background, Q3 = the specific signal implied in the reply.
 */
export const ExaQueriesSchema = z
  .array(
    z.object({
      intent: z.string(),
      query: z.string(),
    }),
  )
  .length(3);

export type ExaQuery = z.infer<typeof ExaQueriesSchema>[number];
