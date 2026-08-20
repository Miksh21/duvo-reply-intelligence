import { claudeText } from "../integrations/claude";
import { loadPrompt } from "../config";
import type { LemlistReplyPayload, SenderIdentity, Slot, Triage } from "../types";

/**
 * Draft a calendar-aware reply — Claude, in the sender's voice, proposing 2–3
 * times chosen ONLY from the open slots we pass in. Plain text (the email body);
 * a human approves it before it ever reaches the prospect.
 */
export async function draftReply(args: {
  payload: LemlistReplyPayload;
  triage: Triage;
  slots: Slot[];
  sender: SenderIdentity;
  callDurationMins: number;
}): Promise<string> {
  const { payload, slots, sender, callDurationMins } = args;

  const system = loadPrompt("reply-draft", {
    sender_name: sender.name,
    sender_title: sender.title,
    sender_company: sender.company,
    duration: String(callDurationMins),
  });

  const availability = slots.length
    ? slots.map((s) => `- ${s.label}`).join("\n")
    : "(no open slots in the requested window — ask the prospect for a couple of times that suit them)";

  const user = [
    `PROSPECT: ${payload.prospect.name}, ${payload.prospect.title} at ${payload.prospect.company}`,
    ``,
    `THEIR REPLY:`,
    `"""`,
    payload.replyText,
    `"""`,
    ``,
    `AVAILABLE_SLOTS (propose 2–3 of THESE only — never invent availability):`,
    availability,
  ].join("\n");

  const draft = await claudeText({ system, user, maxTokens: 600 });
  return draft.trim();
}
