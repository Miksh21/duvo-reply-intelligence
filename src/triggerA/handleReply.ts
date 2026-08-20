import { config } from "../config";
import { isPositive, type Triage } from "../schemas/triage";
import { hubspot } from "../integrations/hubspot";
import { findOpenSlots, type FindSlotsOptions } from "../integrations/calendar";
import { buildReplyCard, postSlack } from "../integrations/slack";
import type { DealProperties, LemlistReplyPayload, Slot } from "../types";
import { triage } from "./triage";
import { draftReply } from "./replyDraft";

export interface HandleReplyResult {
  status: "drafted" | "ignored";
  triage: Triage;
  draft?: string;
  slots?: Slot[];
  slackDelivery?: { delivered: string; path?: string };
}

/** Keep only non-null, non-empty values (so we never overwrite a field with null). */
function nonNull(obj: Record<string, string | null>): Partial<DealProperties> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value != null && value.trim() !== "") out[key] = value;
  }
  return out as Partial<DealProperties>;
}

/** Next Monday at 00:00 local (for "next week" windows). Always a future Monday. */
function nextMondayISO(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let add = (8 - d.getDay()) % 7; // Mon=1 → today if Monday…
  if (add === 0) add = 7; // …but "next week" means a future Monday
  d.setDate(d.getDate() + add);
  return d.toISOString();
}

/** Translate the prospect's raw time phrases into a slot-search window. */
function deriveWindow(proposedTimes: string[]): FindSlotsOptions {
  const joined = proposedTimes.join(" ").toLowerCase();
  const weekdays: Array<[string, string]> = [
    ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"],
  ];
  const prefer = weekdays.filter(([k]) => joined.includes(k)).map(([, v]) => v);

  const opts: FindSlotsOptions = {
    days: config.defaultWindowDays,
    durationMins: config.slotDurationMins,
    maxSlots: 6,
  };
  if (prefer.length) opts.preferWeekdays = prefer;
  if (/next week/.test(joined)) opts.fromISO = nextMondayISO();
  return opts;
}

/**
 * Trigger A orchestration. Triage the reply; if it's not positive, log and stop.
 * If it is: write the extracted signals to HubSpot, find real open slots, draft
 * a calendar-aware reply, and post the approval card to Slack.
 */
export async function handleReply(payload: LemlistReplyPayload): Promise<HandleReplyResult> {
  console.log(
    `\n▶ TRIGGER A — reply from ${payload.prospect.name} (${payload.prospect.company}) · deal ${payload.dealId}`,
  );

  const result = await triage(payload);
  console.log(
    `   triage → ${result.category} (${Math.round(result.confidence * 100)}%) — ${result.reasoning}`,
  );

  if (!isPositive(result.category)) {
    console.log(`   not positive → logged, stopping. No HubSpot write, no draft.`);
    return { status: "ignored", triage: result };
  }

  // (a) Always write non-null signals — low-stakes qualitative fields, auto-write is fine.
  // Also persist prospect context so a real HubSpot deal carries it into Trigger B.
  const s = result.meddpicc_signals;
  await hubspot.updateDeal(payload.dealId, {
    ...nonNull({
      meddpicc_pain: s.pain,
      meddpicc_competitor: s.competitor,
      meddpicc_champion: s.champion,
      meddpicc_timeline: s.timeline,
      meddpicc_decision_process: s.decision_process,
    }),
    prospect_name: payload.prospect.name,
    prospect_title: payload.prospect.title,
    prospect_email: payload.prospect.email,
    prospect_company: payload.prospect.company,
  });

  // (b) Real open slots, biased to whatever the prospect proposed.
  const slots = findOpenSlots(deriveWindow(result.proposed_meeting.prospect_proposed_times));
  console.log(`   open slots: ${slots.map((x) => x.label).join(" · ") || "(none in window)"}`);

  // The call length the prospect asked for (e.g. "20 min"), defaulting to the slot length.
  const requested = payload.replyText.match(/(\d{1,2})\s*min/i);
  const callDurationMins = requested
    ? Math.min(90, Math.max(15, Number(requested[1])))
    : config.slotDurationMins;

  // (c) Draft the reply (Claude) and post the approval card.
  const draft = await draftReply({
    payload,
    triage: result,
    slots,
    sender: config.sender,
    callDurationMins,
  });

  const card = buildReplyCard({
    triage: result,
    prospect: payload.prospect,
    draft,
    slots,
    dealId: payload.dealId,
  });
  const slackDelivery = await postSlack(card, `A-${payload.dealId}`);

  return { status: "drafted", triage: result, draft, slots, slackDelivery };
}
