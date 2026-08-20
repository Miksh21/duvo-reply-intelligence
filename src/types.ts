import type { Triage } from "./schemas/triage";
import type { Brief, ExaQuery } from "./schemas/brief";

export type { Triage, Brief, ExaQuery };

/** The prospect, as it arrives on the lemlist reply webhook. */
export interface Prospect {
  name: string;
  title: string;
  company: string;
  email: string;
}

/**
 * Inbound lemlist reply payload (mocked). Shape mirrors a lemlist reply
 * webhook; the four fields the system actually reads are replyText, prospect,
 * dealId and campaignId. Extra fields (type, leadId, sentAt…) are passed
 * through untouched.
 */
export interface LemlistReplyPayload {
  replyText: string;
  prospect: Prospect;
  dealId: string;
  campaignId: string;
  type?: string;
  campaignName?: string;
  leadId?: string;
  sentAt?: string;
}

/** Writable HubSpot deal properties (the fields the two triggers fill in). */
export interface DealProperties {
  meddpicc_pain: string | null;
  meddpicc_competitor: string | null;
  meddpicc_champion: string | null;
  meddpicc_timeline: string | null;
  meddpicc_decision_process: string | null;
  meddpicc_metrics: string | null;
  meddpicc_economic_buyer: string | null;
  meddpicc_decision_criteria: string | null;
  meddpicc_competition: string | null;
  pre_meeting_brief: string | null;
  evidence_quality: string | null;
  // Prospect context denormalized onto the deal, so Trigger B has it on a real
  // HubSpot deal without walking contact/company associations.
  prospect_name: string | null;
  prospect_title: string | null;
  prospect_email: string | null;
  prospect_company: string | null;
}

export interface DealContact {
  name: string;
  title: string;
  email: string;
}

/** A HubSpot deal as stored in the in-memory mock. */
export interface Deal {
  id: string;
  dealname: string;
  amount: number | null;
  dealstage: string;
  pipeline: string;
  company: string;
  industry: string;
  contact: DealContact;
  source: string;
  properties: DealProperties;
}

/** A free 30-minute slot returned by the calendar mock. */
export interface Slot {
  /** Short human label, e.g. "Wed Jun 3, 15:30". */
  label: string;
  startISO: string;
  endISO: string;
  weekday: string; // "Mon".."Fri"
}

/** A booked meeting linked to a deal (created by /simulate-send). */
export interface Meeting {
  id: string;
  dealId: string;
  title: string;
  startISO: string;
  endISO: string;
  /** Set true once Trigger B has generated a brief, so it never double-fires. */
  hasBrief: boolean;
}

/** One Exa search result, normalized down to what synthesis needs. */
export interface ExaResult {
  title: string;
  url: string;
  text: string;
  highlights: string[];
  publishedDate?: string;
  author?: string;
}

/** An Exa query paired with the results it returned. */
export interface ExaQueryResult {
  intent: string;
  query: string;
  results: ExaResult[];
}

/** Sender identity — whose voice the reply is drafted in (from config/env). */
export interface SenderIdentity {
  name: string;
  title: string;
  company: string;
}
