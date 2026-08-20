import { claudeText } from "../integrations/claude";
import { loadPrompt } from "../config";
import { BriefSchema, BriefSchemaThin, type Brief } from "../schemas/brief";
import { generateValidated } from "../validate";
import type { Deal, ExaQueryResult, SenderIdentity } from "../types";

/**
 * Synthesize the brief — Claude, grounded in the Exa results plus the captured
 * signals. Returns validated Brief JSON. When Exa returned little, the model is
 * told to flag evidence_quality: "thin" and say so in the paragraph rather than
 * fabricate; the schema is relaxed on source count for that thin path.
 */
export async function synthesize(args: {
  deal: Deal;
  sender: SenderIdentity;
  queryResults: ExaQueryResult[];
}): Promise<Brief> {
  const { deal, sender, queryResults } = args;
  const p = deal.properties;
  const totalResults = queryResults.reduce((n, qr) => n + qr.results.length, 0);

  const system = loadPrompt("synthesize", {
    sender: sender.name,
    persona: `${deal.contact.name} (${deal.contact.title})`,
    account: deal.company,
  });

  const resultsBlock = queryResults
    .map((qr, i) => {
      const items = qr.results.length
        ? qr.results
            .map((r, j) => {
              const hl = r.highlights?.length
                ? `\n       highlights: ${r.highlights.slice(0, 3).join(" … ")}`
                : "";
              const text = r.text ? `\n       text: ${r.text.slice(0, 500)}` : "";
              const date = r.publishedDate ? ` (${r.publishedDate.slice(0, 10)})` : "";
              return `     [${i + 1}.${j + 1}] ${r.title}${date}\n       ${r.url}${hl}${text}`;
            })
            .join("\n")
        : "     (no results)";
      return `QUERY ${i + 1} — ${qr.intent}\n     "${qr.query}"\n${items}`;
    })
    .join("\n\n");

  const user = [
    `ACCOUNT: ${deal.company} — ${deal.industry}`,
    `PERSONA: ${deal.contact.name}, ${deal.contact.title}`,
    ``,
    `CAPTURED SIGNALS (Trigger A):`,
    `- pain: ${p.meddpicc_pain ?? "—"}`,
    `- competitor / context: ${p.meddpicc_competitor ?? "—"}`,
    `- champion: ${p.meddpicc_champion ?? "—"}`,
    `- timeline: ${p.meddpicc_timeline ?? "—"}`,
    `- decision process: ${p.meddpicc_decision_process ?? "—"}`,
    ``,
    `EXA RESULTS (${totalResults} total across 3 queries):`,
    resultsBlock,
    ``,
    totalResults < 3
      ? `NOTE: Exa returned thin evidence (${totalResults} results). Set evidence_quality:"thin", say so plainly in the paragraph, and include only sources you actually have. Do not fabricate.`
      : `Use the strongest 3 results as sources.`,
  ].join("\n");

  // Strong path enforces exactly 3 sources; thin path relaxes the count.
  const schema = totalResults >= 3 ? BriefSchema : BriefSchemaThin;

  return generateValidated<Brief>({
    label: "synthesize",
    schema,
    call: (attempt) =>
      claudeText({
        system:
          attempt === 0
            ? system
            : `${system}\n\nReturn ONLY a JSON object with keys: brief_paragraph (string), discovery_framework (array of exactly 5 strings), sources (array of {title,url}), meddpicc_updates ({metrics,economic_buyer,decision_criteria,competition} each string|null), evidence_quality ("strong"|"thin").`,
        user,
        temperature: 0,
        maxTokens: 1600,
      }),
  });
}
