import { claudeText } from "../integrations/claude";
import { loadPrompt } from "../config";
import { ExaQueriesSchema } from "../schemas/brief";
import { generateValidated } from "../validate";
import type { Deal, ExaQuery, SenderIdentity } from "../types";

/**
 * Generate exactly 3 targeted Exa queries — Claude, grounded in the deal context
 * and the signals Trigger A captured. Q1 account initiative, Q2 persona, Q3 the
 * specific signal implied in the reply.
 */
export async function generateExaQueries(args: {
  deal: Deal;
  sender: SenderIdentity;
}): Promise<ExaQuery[]> {
  const { deal, sender } = args;
  const p = deal.properties;

  const system = loadPrompt("exa-queries", {
    sender: sender.name,
    persona: `${deal.contact.name} (${deal.contact.title})`,
    account: deal.company,
  });

  const user = [
    `ACCOUNT: ${deal.company} — ${deal.industry}`,
    `PERSONA: ${deal.contact.name}, ${deal.contact.title}`,
    `DEAL: ${deal.dealname}`,
    ``,
    `CAPTURED SIGNALS (from their reply, via Trigger A):`,
    `- pain: ${p.meddpicc_pain ?? "—"}`,
    `- competitor / context: ${p.meddpicc_competitor ?? "—"}`,
    `- champion: ${p.meddpicc_champion ?? "—"}`,
    `- timeline: ${p.meddpicc_timeline ?? "—"}`,
    `- decision process: ${p.meddpicc_decision_process ?? "—"}`,
  ].join("\n");

  return generateValidated({
    label: "exa-queries",
    schema: ExaQueriesSchema,
    call: (attempt) =>
      claudeText({
        system:
          attempt === 0
            ? system
            : `${system}\n\nReturn ONLY a JSON array of exactly 3 objects, each {"intent": string, "query": string}.`,
        user,
        temperature: 0,
        maxTokens: 600,
      }),
  });
}
