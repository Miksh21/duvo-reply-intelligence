import { openaiJSON } from "../integrations/openai";
import { claudeText } from "../integrations/claude";
import { config, loadPrompt } from "../config";
import { TriageSchema, type Triage } from "../schemas/triage";
import { generateValidated } from "../validate";
import type { LemlistReplyPayload } from "../types";

/**
 * Classify the reply and extract MEDDPICC signals — zod-validated with one
 * retry. Runs on OpenAI JSON mode by default (the documented model split); set
 * TRIAGE_PROVIDER=anthropic to run triage on Claude too, so the whole pipeline
 * runs on Anthropic (e.g. when no OpenAI key is available).
 */
export async function triage(payload: LemlistReplyPayload): Promise<Triage> {
  const system = loadPrompt("triage");
  const user = [
    `PROSPECT: ${payload.prospect.name}, ${payload.prospect.title} at ${payload.prospect.company}`,
    ``,
    `REPLY TEXT:`,
    `"""`,
    payload.replyText,
    `"""`,
  ].join("\n");

  return generateValidated({
    label: "triage",
    schema: TriageSchema,
    call: (attempt) => {
      const sys =
        attempt === 0
          ? system
          : `${system}\n\nReturn ONLY a single valid JSON object matching the schema. No prose, no code fences.`;
      // Anthropic path uses a "{" prefill to force clean JSON; OpenAI uses JSON mode.
      return config.triageProvider === "anthropic"
        ? claudeText({ system: sys, user, temperature: 0, maxTokens: 800 })
        : openaiJSON({ system: sys, user });
    },
  });
}
