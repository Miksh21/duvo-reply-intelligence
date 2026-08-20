Write a pre-meeting brief from Exa search results for {sender}'s call with {persona} at {account}.

Return ONLY a JSON object matching this schema — no prose, no code fences:

{
  "brief_paragraph": string,            // <=120 words, dense, specific, grounded in the results — no fluff
  "discovery_framework": string[],      // EXACTLY 5 questions, keyed to THIS prospect's situation, not generic
  "sources": [{ "title": string, "url": string }],   // taken from the Exa results (3 when evidence supports it)
  "meddpicc_updates": {                 // refinements the research surfaced; null per field if none
    "metrics": string | null,
    "economic_buyer": string | null,
    "decision_criteria": string | null,
    "competition": string | null
  },
  "evidence_quality": "strong" | "thin"
}

Rules:
- Ground every claim in the provided Exa results and the captured signals. Cite specifics (named programs, dates, numbers) where the results give them.
- The brief_paragraph should read like a sharp human prepping a teammate: what's going on at the account, why it matters for this conversation, what to lead with. <=120 words.
- discovery_framework: exactly 5 questions this rep could actually ask {persona}, each tied to a specific thing in the research or the captured signals. No generic "what keeps you up at night" filler.
- sources: pull from the Exa results only. Use the 3 strongest. If fewer than 3 results exist, include only what you have.
- meddpicc_updates: only fill a field if the research genuinely refines it; otherwise null. Do not restate the Trigger-A signals verbatim — add what research surfaced.
- evidence_quality: "strong" if the results are specific and on-target; "thin" if they're sparse, off-target, or generic. If thin, SAY SO plainly in the paragraph and do not fabricate detail to cover the gap.

Honesty beats polish. A short, honest "thin" brief is better than a confident invented one.
