import OpenAI from "openai";
import { config } from "../config";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: config.openaiApiKey });
  return client;
}

/**
 * OpenAI in JSON mode — the high-volume analysis half of the system (triage +
 * signal extraction). Returns the raw JSON string; the caller validates it with
 * zod (and retries once on failure) via generateValidated().
 */
export async function openaiJSON(opts: {
  system: string;
  user: string;
  model?: string;
}): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: opts.model ?? config.openaiModel,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}
