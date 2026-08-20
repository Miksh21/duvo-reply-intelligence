// Load .env with override so the local file is authoritative even when the shell
// already has (possibly empty) OPENAI/ANTHROPIC/EXA vars set in the environment.
import dotenv from "dotenv";
dotenv.config({ override: true });
import fs from "node:fs";
import path from "node:path";
import type { SenderIdentity } from "./types";

/** Project root — config.ts lives in src/, so root is one level up. */
export const ROOT = path.resolve(__dirname, "..");
export const PROMPTS_DIR = path.join(ROOT, "prompts");
export const DATA_DIR = path.join(ROOT, "data");
export const OUT_DIR = path.join(ROOT, "out");

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : fallback;
}

export const sender: SenderIdentity = {
  name: optional("SENDER_NAME", "Tomáš Beneš"),
  title: optional("SENDER_TITLE", "Co-founder"),
  company: optional("SENDER_COMPANY", "Duvo"),
};

export const config = {
  port: Number(optional("PORT", "3000")),

  // Real APIs — lazily required so non-LLM routes (and `npm run reset`) work
  // without keys. Each integration calls requireKey() at call time.
  get openaiApiKey() {
    return required("OPENAI_API_KEY");
  },
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY");
  },
  get exaApiKey() {
    return required("EXA_API_KEY");
  },

  // Optional real Slack; falls back to console + file when unset.
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL?.trim() || null,

  // HubSpot: real CRM v3 when a Private App token is set, else the in-memory mock.
  hubspotAccessToken: process.env.HUBSPOT_ACCESS_TOKEN?.trim() || null,
  hubspotBaseUrl: optional("HUBSPOT_BASE_URL", "https://api.hubapi.com"),

  // lemlist API key (optional; for verifying auth + fetching reply text).
  lemlistApiKey: process.env.LEMLIST_API_KEY?.trim() || null,

  // Model split: cheap structured model for triage, stronger model for anything
  // a human/prospect reads. Both overridable via env.
  openaiModel: optional("OPENAI_MODEL", "gpt-4o-mini"),
  claudeModel: optional("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
  // Which provider runs triage. Default "openai" (the documented model split);
  // set TRIAGE_PROVIDER=anthropic to run the whole pipeline on Claude only
  // (e.g. when no OpenAI key is available).
  triageProvider: (optional("TRIAGE_PROVIDER", "openai").toLowerCase() === "anthropic"
    ? "anthropic"
    : "openai") as "openai" | "anthropic",

  exaNumResults: 5,
  briefLeadHours: Number(optional("BRIEF_LEAD_HOURS", "18")),

  sender,

  // Calendar / slot behavior.
  slotDurationMins: 30,
  defaultWindowDays: 5, // next 5 business days when the prospect proposes no time

  paths: { ROOT, PROMPTS_DIR, DATA_DIR, OUT_DIR },
} as const;

/**
 * Load a prompt file from prompts/<name>.md and interpolate {placeholders}.
 * Each .md is the SYSTEM prompt (static instructions); the dynamic USER message
 * is assembled in code. Unmatched {placeholders} are left as-is and logged.
 */
export function loadPrompt(name: string, vars: Record<string, string> = {}): string {
  const file = path.join(PROMPTS_DIR, `${name}.md`);
  let text = fs.readFileSync(file, "utf8");
  for (const [key, value] of Object.entries(vars)) {
    text = text.split(`{${key}}`).join(value);
  }
  return text.trim();
}
