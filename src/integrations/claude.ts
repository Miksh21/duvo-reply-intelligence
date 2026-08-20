import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

/**
 * Claude — the generative half of the system. Everything a human or prospect
 * reads (reply copy, Exa queries, the brief) is produced here.
 *
 * JSON steps pass temperature 0 and rely on a strict "JSON only" system prompt
 * plus the tolerant parser in validate.ts (stray code fences / prose are
 * stripped, with one retry); plain-text generation (the reply draft) runs a bit
 * warmer. No assistant-message prefill — newer Sonnet models reject it.
 */
export async function claudeText(opts: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const res = await getClient().messages.create({
    model: opts.model ?? config.claudeModel,
    max_tokens: opts.maxTokens ?? 1400,
    temperature: opts.temperature ?? 0.4,
    system: opts.system,
    messages: [{ role: "user" as const, content: opts.user }],
  });

  return res.content.map((block) => (block.type === "text" ? block.text : "")).join("").trim();
}
