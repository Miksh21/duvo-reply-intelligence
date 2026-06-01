# Reply Intelligence

**A human-in-the-loop reply-automation system for B2B outbound — built end-to-end on n8n.**

When a prospect replies, it triages the intent, scores the account on its automation footprint, drafts a calendar-aware response, and drops a one-click approval card in Slack. When a meeting gets booked, it generates a researched pre-meeting brief — as a PDF one-pager — the *morning of* the call. **Drafts never auto-send. A human approves everything.**

> 🎥 **Walkthrough (Loom):** _<add link here>_

Built as a GTM-engineering audition for **Duvo**. It runs today, on real APIs — not a mockup.

---

## The idea

Every rep sits on the same two bottlenecks: **triaging replies**, and **prepping for the meetings those replies create**. The buying signal is already there in the reply and in the account — it just never gets operationalised. This system operationalises it, without taking the human out of the loop.

Two decoupled triggers, one workflow, two human gates (★).

![Architecture](docs/architecture.png)

*Faithful render of the live n8n canvas — 66 nodes. Full vector: [`docs/architecture.svg`](docs/architecture.svg). Dashed edges are the "else/false" branch.*

---

## What it does

### ▸ Trigger A — a reply lands `(webhook)`
1. **Triage** the reply with Claude → one of **7 intent classes** (`positive_meeting`, `positive_curious`, `objection`, `referral`, `not_interested`, `auto_reply`, `unsubscribe`), plus extracted MEDDPICC signals.
2. **Score the account** — resolve the domain, enrich with **Sumble** (technographics), and tier it on its **RPA / automation footprint** (`hot` / `warm` / `cold`).
3. **Propose a time** matched to what the prospect asked for, write the signals to **HubSpot**, and have Claude **draft a calendar-aware reply**.
4. **Post a Slack approval card** — tier, the prospect's message, the AI draft, the proposed time, and two buttons: **✅ Accept & send** / **✏️ Edit in lemlist**.
   - Non-positive replies route to a categorised triage notice instead; `auto_reply` is silently ignored.

### ▸ Handler — the human decides `(Slack button)` ★
- **Accept** → create the **HubSpot meeting** (+ associate it to the deal), send the reply via **lemlist** on the prospect's channel, ✅-react on the card, and post a threaded confirmation.
- **Edit** → ✏️-react and hand the conversation to lemlist.
- The AE books the meeting — never the prospect. Nothing is sent without this click.

### ▸ Scheduler — every morning `(07:00 cron)`
- Find the meetings starting **today** in HubSpot, resolve each to its deal, and fire Trigger B. This is the clock that makes the brief land the morning of the meeting, not at reply time.

### ▸ Trigger B — the pre-meeting brief + PDF
- Re-enrich with **Sumble**, generate research queries with Claude, run them through **Exa**, and synthesise a brief: a tight angle, **5 discovery questions**, sources, and an honest `evidence_quality` flag.
- Deliver a **concise Slack notification** + a **PDF one-pager** generated *inside the workflow* and uploaded to the channel. ([sample](docs/sample-brief-onepager.pdf))

---

## Engineering decisions worth calling out

- **Native nodes where they fit, credentialed HTTP where they can't.** The native HubSpot node has no *meetings* resource and the native lemlist node has no *inbox* resource — I verified that against the node catalog rather than guessing, so those calls are credentialed HTTP. Exa and the Slack file-upload use their native nodes. Every external call carries its real credential.
- **Zero-dependency PDF generation.** The one-pager is a hand-rolled PDF built in a Code node ([`src/pdf-onepager.js`](src/pdf-onepager.js)) — no external render service, no API key, no community node. Helvetica + WinAnsi, ASCII-transliterated so diacritics never garble.
- **One workflow, validated deploys.** Four triggers live in a single workflow (n8n fires one execution per trigger). The merge step self-validates — it refuses to deploy if any `$('node')` reference is dangling — which caught a real em-dash-escaping bug before it shipped.
- **Human-in-the-loop by design.** The Slack card is a hard gate. The system drafts, tiers, proposes, and researches; the human always sends.
- **Multichannel-aware.** A reply can arrive by email, LinkedIn, or WhatsApp (lemlist's unified inbox); the booking detail goes to email, the confirmation to the channel the prospect used.

---

## Why this shape, for Duvo

- The account tier is driven by the **RPA / automation footprint** — the *post-RPA-disillusionment* wedge, scored automatically from real technographic data. That's the signal that decides who's worth a rep's time.
- It's **account-intelligence-driven** and **retail-ops-shaped**: the sample brief is a real €5B-program retailer running four overlapping RPA platforms with no orchestration layer.
- It's a system a rep would actually **trust and use** — because it never acts on their behalf without a click.

---

## Status — what's real

| Component | State |
|---|---|
| Claude triage + draft + brief synthesis (Anthropic) | ✅ live |
| Sumble account enrichment / RPA tiering | ✅ live |
| Exa research | ✅ live (native node) |
| HubSpot — deals, meetings, associations | ✅ live (real portal) |
| lemlist — multichannel send | ✅ live (real workspace) |
| Slack — approval card, reactions, PDF upload | ✅ live |
| Triage model | Claude today; intentionally swappable to a cheaper model for high-volume triage |

Everything in the diagram is deployed and test-verified end-to-end on a self-hosted n8n instance.

---

## Stack

`n8n` · `Anthropic Claude (Sonnet)` · `Exa` · `Sumble` · `HubSpot CRM` · `lemlist` · `Slack`

## Repo contents

```
workflow/reply-intelligence.workflow.json   importable n8n workflow (credential IDs placeholdered)
docs/architecture.svg | .png                 the system diagram
docs/sample-brief-onepager.pdf               a real, workflow-generated pre-meeting brief
src/pdf-onepager.js                          the zero-dependency PDF generator
```

To run it yourself: import the workflow into n8n, create the six credentials (Anthropic, HubSpot, Sumble, lemlist, Slack, Exa), replace the `YOUR_*` placeholders, and point a lemlist reply webhook at the `reply-native` path.
