import { z } from "zod";

/**
 * Triage output — produced by OpenAI (cheap, fast, structured) from a single
 * inbound reply. Classify into exactly one category, extract qualification
 * signals ONLY where the text supports them, and surface any proposed times.
 *
 * Mirrors §4 of the build brief verbatim.
 */
export const TriageSchema = z.object({
  category: z.enum([
    "positive_meeting", // wants to talk + proposes/asks for a time
    "positive_curious", // interested, no time proposed ("tell me more")
    "objection",
    "referral", // redirects to someone else
    "not_interested",
    "auto_reply", // OOO / bounce / autoresponder
    "unsubscribe",
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(), // one sentence
  meddpicc_signals: z.object({
    // Populate a field ONLY if the reply text genuinely supports it, else null.
    pain: z.string().nullable(), // pain language, quoted/paraphrased
    competitor: z.string().nullable(), // any named alternative/incumbent
    champion: z.string().nullable(), // implied internal advocate
    timeline: z.string().nullable(), // any timing cue
    decision_process: z.string().nullable(), // e.g. "cc'd chief of staff", "after Q3 review"
  }),
  proposed_meeting: z.object({
    requested: z.boolean(),
    prospect_proposed_times: z.array(z.string()), // raw phrases, e.g. ["Wed", "Thu", "next week"]
  }),
});

export type Triage = z.infer<typeof TriageSchema>;

export const POSITIVE_CATEGORIES = ["positive_meeting", "positive_curious"] as const;

export function isPositive(category: Triage["category"]): boolean {
  return (POSITIVE_CATEGORIES as readonly string[]).includes(category);
}
