import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config";
import { hubspot } from "./integrations/hubspot";
import * as calendar from "./integrations/calendar";
import { handleReply } from "./triggerA/handleReply";
import { runBriefForDeal, runBriefForMeetingId, runDueBriefs } from "./triggerB/runBriefs";
import type { LemlistReplyPayload } from "./types";

const app = express();
app.use(express.json());

/** Wrap async route handlers so rejections become clean JSON 500s. */
function h(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "duvo-reply-intelligence" });
});

// ── TRIGGER A ──────────────────────────────────────────────────────────────
// A lemlist reply arrives (mocked). Triage → (if positive) signals + draft + card.
app.post(
  "/webhook/lemlist-reply",
  h(async (req, res) => {
    const body = req.body as Partial<LemlistReplyPayload>;
    if (!body?.replyText || !body?.prospect || !body?.dealId) {
      res.status(400).json({ error: "Expected { replyText, prospect, dealId, campaignId }" });
      return;
    }
    const result = await handleReply(body as LemlistReplyPayload);
    res.json(result);
  }),
);

// Simulate the human approving + sending → books the meeting (links it to the deal).
app.post(
  "/simulate-send",
  h(async (req, res) => {
    const { dealId, slot } = (req.body ?? {}) as { dealId?: string; slot?: string };
    if (!dealId) {
      res.status(400).json({ error: "Expected { dealId, slot? }" });
      return;
    }
    const deal = await hubspot.getDeal(dealId);
    const { meeting, resolvedFrom } = calendar.bookForSimulateSend(
      dealId,
      slot,
      `Intro call — ${deal.company} (${deal.contact.name})`,
    );
    console.log(`\n📅 /simulate-send — booked ${meeting.id} for deal ${dealId} (${resolvedFrom})`);
    res.json({ status: "booked", meeting, resolvedFrom });
  }),
);

// ── TRIGGER B ──────────────────────────────────────────────────────────────
// Morning-of brief. Force by dealId or meetingId (demo), or run the due scan.
app.post(
  "/trigger-b/run",
  h(async (req, res) => {
    const { dealId, meetingId } = (req.body ?? {}) as { dealId?: string; meetingId?: string };
    if (meetingId) {
      const brief = await runBriefForMeetingId(meetingId);
      res.json({ status: "briefed", mode: "meetingId", brief });
      return;
    }
    if (dealId) {
      const brief = await runBriefForDeal(dealId);
      res.json({ status: "briefed", mode: "dealId", brief });
      return;
    }
    const briefed = await runDueBriefs();
    res.json({ status: "scan-complete", mode: "due-scan", briefed });
  }),
);

// ── Read-only inspection (handy for the demo / Loom) ─────────────────────────
app.get(
  "/deals",
  h(async (_req, res) => {
    res.json(await hubspot.listDeals());
  }),
);
app.get(
  "/deals/:id",
  h(async (req, res) => {
    const deal = await hubspot.listDeals().then((all) => all.find((d) => d.id === req.params.id));
    if (!deal) {
      res.status(404).json({ error: `deal ${req.params.id} not found` });
      return;
    }
    res.json(deal);
  }),
);
app.get("/calendar", (_req, res) => {
  res.json({
    meetings: calendar.getMeetings(),
    nextOpenSlots: calendar.findOpenSlots({ maxSlots: 6 }),
  });
});

// JSON error handler (Express 5 forwards async rejections here via `next`).
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`✖ ${err.message}`);
  res.status(500).json({ error: err.message });
});

app.listen(config.port, () => {
  const slackMode = config.slackWebhookUrl ? "real webhook" : "console + out/slack-cards/";
  console.log(
    [
      ``,
      `  Duvo · Reply Intelligence System`,
      `  ─────────────────────────────────`,
      `  http://localhost:${config.port}`,
      `  triage       : ${
        config.triageProvider === "anthropic"
          ? `${config.claudeModel}  (Claude — TRIAGE_PROVIDER=anthropic)`
          : `${config.openaiModel}  (OpenAI — classify + extract)`
      }`,
      `  gen model    : ${config.claudeModel}  (Claude — reply, queries, brief)`,
      `  Slack        : ${slackMode}`,
      `  brief window : meetings within ${config.briefLeadHours}h (Trigger B scan)`,
      ``,
      `  Trigger A : ./scripts/demo-trigger-a.sh 01`,
      `  send      : curl -s localhost:${config.port}/simulate-send -H 'content-type: application/json' -d '{"dealId":"deal-001","slot":"Wed 15:30"}'`,
      `  Trigger B : ./scripts/demo-trigger-b.sh deal-001`,
      ``,
    ].join("\n"),
  );
});
