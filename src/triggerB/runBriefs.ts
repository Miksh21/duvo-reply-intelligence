import { config } from "../config";
import { hubspot } from "../integrations/hubspot";
import * as calendar from "../integrations/calendar";
import { buildBriefCard, postSlack } from "../integrations/slack";
import type { Brief, Deal, Meeting } from "../types";
import { generateExaQueries } from "./exaQueries";
import { runExaSearches } from "./exaSearch";
import { synthesize } from "./synthesize";

/** Format the structured brief into the long-text value written to the HubSpot deal. */
function formatBriefForHubSpot(brief: Brief, meetingLabel: string): string {
  const lines = [
    `PRE-MEETING BRIEF — ${meetingLabel}  ·  evidence: ${brief.evidence_quality}`,
    ``,
    brief.brief_paragraph,
    ``,
    `Discovery questions:`,
    ...brief.discovery_framework.map((q, i) => `  ${i + 1}. ${q}`),
    ``,
    `Sources:`,
    ...brief.sources.map((s, i) => `  ${i + 1}. ${s.title} — ${s.url}`),
  ];
  return lines.join("\n");
}

/** Run the full brief pipeline for one deal/meeting and deliver it. */
export async function runBriefForMeeting(
  deal: Deal,
  meeting: Meeting | null,
  meetingLabel: string,
): Promise<Brief> {
  console.log(
    `\n▶ TRIGGER B — pre-meeting brief for ${deal.company} (${deal.contact.name}) · ${meetingLabel}`,
  );

  // (b) Claude → 3 queries
  const queries = await generateExaQueries({ deal, sender: config.sender });
  console.log(`   3 Exa queries generated:`);
  queries.forEach((q, i) => console.log(`     ${i + 1}. [${q.intent}] ${q.query}`));

  // (c) 3 Exa searches in parallel
  const queryResults = await runExaSearches(queries);
  const total = queryResults.reduce((n, qr) => n + qr.results.length, 0);
  console.log(`   Exa returned ${total} result(s) total`);

  // (d) Claude → brief
  const brief = await synthesize({ deal, sender: config.sender, queryResults });
  console.log(`   brief synthesized (evidence: ${brief.evidence_quality})`);

  // (e) write brief to HubSpot + Slack it
  const u = brief.meddpicc_updates;
  await hubspot.updateDeal(deal.id, {
    pre_meeting_brief: formatBriefForHubSpot(brief, meetingLabel),
    evidence_quality: brief.evidence_quality,
    meddpicc_metrics: u.metrics ?? undefined,
    meddpicc_economic_buyer: u.economic_buyer ?? undefined,
    meddpicc_decision_criteria: u.decision_criteria ?? undefined,
    meddpicc_competition: u.competition ?? undefined,
  });

  const card = buildBriefCard({ deal, meeting, meetingLabel, brief, queryResults });
  await postSlack(card, `B-${deal.id}`);

  if (meeting) calendar.markBriefed(meeting.id);
  return brief;
}

function byStart(a: Meeting, b: Meeting): number {
  return new Date(a.startISO).getTime() - new Date(b.startISO).getTime();
}

/**
 * Force a brief for a deal (demo entry point). Prefers the soonest un-briefed
 * booked meeting; if none exists (the human hasn't "sent" yet), runs anyway off
 * deal context with a forced label, so the demo never dead-ends.
 */
export async function runBriefForDeal(dealId: string): Promise<Brief> {
  const deal = await hubspot.getDeal(dealId);
  const meeting = calendar.getMeetingsForDeal(dealId).filter((m) => !m.hasBrief).sort(byStart)[0] ?? null;
  const meetingLabel = meeting
    ? calendar.labelForISO(meeting.startISO)
    : "upcoming call (no booked meeting — forced for demo)";
  return runBriefForMeeting(deal, meeting, meetingLabel);
}

/** Force a brief for a specific booked meeting id. */
export async function runBriefForMeetingId(meetingId: string): Promise<Brief> {
  const meeting = calendar.getMeetingById(meetingId);
  if (!meeting) throw new Error(`No meeting "${meetingId}"`);
  const deal = await hubspot.getDeal(meeting.dealId);
  return runBriefForMeeting(deal, meeting, calendar.labelForISO(meeting.startISO));
}

/**
 * The morning-of scan: brief every meeting starting within BRIEF_LEAD_HOURS that
 * is linked to a deal and not yet briefed. This is what a real scheduler calls.
 */
export async function runDueBriefs(): Promise<Array<{ dealId: string; meetingId: string; evidence_quality: string }>> {
  const due = calendar
    .getMeetingsDueWithin(config.briefLeadHours)
    .filter((m) => m.dealId && !m.hasBrief);

  console.log(`\n▶ TRIGGER B scan — ${due.length} meeting(s) due within ${config.briefLeadHours}h`);
  const out: Array<{ dealId: string; meetingId: string; evidence_quality: string }> = [];
  for (const meeting of due) {
    const deal = await hubspot.getDeal(meeting.dealId);
    const brief = await runBriefForMeeting(deal, meeting, calendar.labelForISO(meeting.startISO));
    out.push({ dealId: meeting.dealId, meetingId: meeting.id, evidence_quality: brief.evidence_quality });
  }
  return out;
}
