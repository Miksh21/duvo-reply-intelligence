import fs from "node:fs";
import path from "node:path";
import { config, OUT_DIR, ROOT } from "../config";
import type { Brief, Deal, ExaQueryResult, Meeting, Prospect, Slot, Triage } from "../types";

type Block = Record<string, unknown>;

export interface SlackCard {
  /** Block Kit blocks — what a real Slack webhook receives. */
  blocks: Block[];
  /** Fallback notification text (also what shows in notifications). */
  text: string;
  /** Plain, readable render for console fallback mode. */
  consoleText: string;
}

function header(text: string): Block {
  // Slack header plain_text caps at 150 chars.
  return { type: "header", text: { type: "plain_text", text: text.slice(0, 150), emoji: true } };
}
function section(markdown: string): Block {
  return { type: "section", text: { type: "mrkdwn", text: markdown } };
}
function context(markdown: string): Block {
  return { type: "context", elements: [{ type: "mrkdwn", text: markdown }] };
}
const divider: Block = { type: "divider" };

function buttons(labels: string[]): Block {
  return {
    type: "actions",
    elements: labels.map((label, i) => ({
      type: "button",
      text: { type: "plain_text", text: label, emoji: true },
      // Illustrative only — no interactivity wired in this demo.
      action_id: `action_${i}`,
      ...(label.toLowerCase().includes("send") ? { style: "primary" } : {}),
      ...(label.toLowerCase().includes("wrong") ? { style: "danger" } : {}),
    })),
  };
}

function signalLines(t: Triage): string[] {
  const s = t.meddpicc_signals;
  const rows: Array<[string, string | null]> = [
    ["Pain", s.pain],
    ["Competitor", s.competitor],
    ["Champion", s.champion],
    ["Timeline", s.timeline],
    ["Decision process", s.decision_process],
  ];
  const present = rows.filter(([, v]) => v && v.trim() !== "");
  if (present.length === 0) return ["_No qualification signals extracted from this reply._"];
  return present.map(([k, v]) => `• *${k}:* ${v}`);
}

// ---------------------------------------------------------------------------
// Trigger A card — triage + signals + draft reply + approval buttons
// ---------------------------------------------------------------------------
export function buildReplyCard(args: {
  triage: Triage;
  prospect: Prospect;
  draft: string;
  slots: Slot[];
  dealId: string;
}): SlackCard {
  const { triage, prospect, draft, slots, dealId } = args;
  const conf = `${Math.round(triage.confidence * 100)}%`;
  const head = `✅ ${triage.category} · ${conf} · ${prospect.company} / ${prospect.title}`;
  const signals = signalLines(triage);
  const slotList = slots.length
    ? slots.map((s) => `\`${s.label}\``).join(" · ")
    : "_none found in window_";

  const blocks: Block[] = [
    header(head),
    section(`*${prospect.name}* — ${prospect.title}, ${prospect.company}  ·  deal \`${dealId}\`\n_${triage.reasoning}_`),
    divider,
    section(`*Qualification signals → written to HubSpot*\n${signals.join("\n")}`),
    section(`*Open slots offered:* ${slotList}`),
    divider,
    section(`*Draft reply* _(human approves before anything sends)_:\n\n>>> ${draft.replace(/\n/g, "\n> ")}`),
    buttons(["✅ Send", "✏️ Edit", "⚠️ Wrong classification"]),
    context("Reply-handling · _drafts, never sends — a human at the keyboard hits Send_"),
  ];

  const consoleText = [
    "┌─────────────────────────────────────────────────────────────────────",
    `│ SLACK CARD · TRIGGER A · reply handling`,
    `│ ${head}`,
    `│ ${prospect.name} — ${prospect.title}, ${prospect.company} · deal ${dealId}`,
    `│ why: ${triage.reasoning}`,
    "│",
    "│ Signals → HubSpot:",
    ...signals.map((s) => `│   ${s.replace(/\*/g, "")}`),
    "│",
    `│ Open slots offered: ${slots.map((s) => s.label).join(" · ") || "(none)"}`,
    "│",
    "│ Draft reply (human approves before send):",
    ...draft.split("\n").map((l) => `│   ${l}`),
    "│",
    "│ [ ✅ Send ]  [ ✏️ Edit ]  [ ⚠️ Wrong classification ]",
    "└─────────────────────────────────────────────────────────────────────",
  ].join("\n");

  return { blocks, text: `${head} — draft reply ready for approval`, consoleText };
}

// ---------------------------------------------------------------------------
// Trigger B card — pre-meeting brief
// ---------------------------------------------------------------------------
export function buildBriefCard(args: {
  deal: Deal;
  meeting: Meeting | null;
  meetingLabel: string;
  brief: Brief;
  queryResults: ExaQueryResult[];
}): SlackCard {
  const { deal, brief, meetingLabel, queryResults } = args;
  const flag = brief.evidence_quality === "strong" ? "🟢 strong" : "🟠 thin";
  const head = `📋 Pre-meeting brief · ${deal.company} · ${meetingLabel}`;

  const questions = brief.discovery_framework.map((q, i) => `${i + 1}. ${q}`).join("\n");
  const sources = brief.sources.map((s, i) => `${i + 1}. <${s.url}|${s.title}>`).join("\n");
  const queriesRun = queryResults.map((q) => `• _${q.intent}_ — ${q.results.length} result(s)`).join("\n");

  const updates = brief.meddpicc_updates;
  const updateRows = [
    ["Metrics", updates.metrics],
    ["Economic buyer", updates.economic_buyer],
    ["Decision criteria", updates.decision_criteria],
    ["Competition", updates.competition],
  ].filter(([, v]) => v) as Array<[string, string]>;

  const blocks: Block[] = [
    header(head),
    section(`*${deal.contact.name}* — ${deal.contact.title}, ${deal.company}  ·  deal \`${deal.id}\`  ·  evidence: *${flag}*`),
    divider,
    section(`*Brief*\n${brief.brief_paragraph}`),
    section(`*Discovery questions*\n${questions}`),
    section(`*Sources*\n${sources}`),
  ];
  if (updateRows.length) {
    blocks.push(section(`*MEDDPICC refinements from research*\n${updateRows.map(([k, v]) => `• *${k}:* ${v}`).join("\n")}`));
  }
  blocks.push(divider, context(`Searches run:\n${queriesRun}`));

  const consoleText = [
    "┌─────────────────────────────────────────────────────────────────────",
    `│ SLACK CARD · TRIGGER B · pre-meeting brief`,
    `│ ${head}`,
    `│ ${deal.contact.name} — ${deal.contact.title}, ${deal.company} · deal ${deal.id}`,
    `│ evidence quality: ${flag}`,
    "│",
    "│ Brief:",
    ...brief.brief_paragraph.split("\n").flatMap((l) => wrap(l, 66).map((w) => `│   ${w}`)),
    "│",
    "│ Discovery questions:",
    ...brief.discovery_framework.flatMap((q, i) => wrap(`${i + 1}. ${q}`, 66).map((w) => `│   ${w}`)),
    "│",
    "│ Sources:",
    ...brief.sources.map((s, i) => `│   ${i + 1}. ${s.title} — ${s.url}`),
    ...(updateRows.length
      ? ["│", "│ MEDDPICC refinements:", ...updateRows.map(([k, v]) => `│   ${k}: ${v}`)]
      : []),
    "│",
    "│ Searches run:",
    ...queryResults.map((q) => `│   • ${q.intent} — ${q.results.length} result(s)`),
    "└─────────────────────────────────────────────────────────────────────",
  ].join("\n");

  return { blocks, text: `${head} (evidence: ${brief.evidence_quality})`, consoleText };
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

// ---------------------------------------------------------------------------
// Sink — real webhook OR console + file. Same card either way.
// ---------------------------------------------------------------------------
export async function postSlack(
  card: SlackCard,
  filename: string,
): Promise<{ delivered: "webhook" | "console+file"; path?: string }> {
  if (config.slackWebhookUrl) {
    const res = await fetch(config.slackWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blocks: card.blocks, text: card.text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Slack webhook failed: ${res.status} ${body}`.trim());
    }
    console.log(`📨 Slack card POSTed to webhook (${filename})`);
    return { delivered: "webhook" };
  }

  const dir = path.join(OUT_DIR, "slack-cards");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${filename}.json`);
  fs.writeFileSync(file, JSON.stringify({ blocks: card.blocks, text: card.text }, null, 2));
  console.log(`\n${card.consoleText}\n  ↳ saved: ${path.relative(ROOT, file)}\n`);
  return { delivered: "console+file", path: file };
}
