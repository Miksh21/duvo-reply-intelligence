import { ZodError, type ZodType } from "zod";

function describe(err: unknown): string {
  if (err instanceof ZodError) {
    return err.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Tolerant JSON extraction: handles pure JSON, ```json fences, and JSON with
 * leading/trailing prose. OpenAI json_object mode and Claude prefill both emit
 * clean JSON, but this keeps a stray code fence from sinking a run.
 */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to fence/brace recovery
  }
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(unfenced.trim());
  } catch {
    // fall through to brace/bracket slice
  }
  const firstObj = unfenced.indexOf("{");
  const firstArr = unfenced.indexOf("[");
  const start =
    firstArr === -1 ? firstObj : firstObj === -1 ? firstArr : Math.min(firstObj, firstArr);
  const openChar = unfenced[start];
  const closeChar = openChar === "[" ? "]" : "}";
  const end = unfenced.lastIndexOf(closeChar);
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(unfenced.slice(start, end + 1));
  }
  throw new Error("no JSON object/array found in model output");
}

/**
 * Call an LLM, parse JSON, validate against a zod schema; retry exactly once on
 * any parse/validation failure, then throw. No silent failures (brief §scope).
 *
 * `call(attempt)` performs the model call and returns the raw output (string or
 * an already-parsed object). It may tighten its instruction when attempt > 0.
 */
export async function generateValidated<T>(opts: {
  label: string;
  schema: ZodType<T>;
  call: (attempt: number) => Promise<string | unknown>;
}): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await opts.call(attempt);
      const json = typeof raw === "string" ? extractJson(raw) : raw;
      return opts.schema.parse(json);
    } catch (err) {
      lastErr = err;
      const which = attempt === 0 ? "1st try" : "retry";
      console.warn(`[validate] ${opts.label}: ${which} failed — ${describe(err)}`);
    }
  }
  throw new Error(`[validate] ${opts.label}: invalid output after retry — ${describe(lastErr)}`);
}
