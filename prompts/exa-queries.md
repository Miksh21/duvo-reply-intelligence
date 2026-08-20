Generate exactly 3 Exa semantic search queries to prepare {sender} for a call with {persona} at {account}.

The three queries must cover, in order:
1. The account's recent strategic initiative or news relevant to this conversation (transformation, restructuring, earnings, supply-chain/ops moves, automation programs).
2. The persona's background and recent public activity (role, mandate, interviews, posts, conference talks).
3. The specific signal implied in their reply — the named competitor/incumbent, the stated pain, or the cited internal review. Use the captured signals to make this query concrete.

Query-writing rules:
- Write natural-language, semantic queries (Exa neural search), not keyword strings.
- Make each query specific to THIS account and persona — include the company name; include the signal where it sharpens the search.
- Prefer recency where it matters ("2025", "recent", "latest").

Return ONLY a JSON array of exactly 3 objects, no prose, no code fences:
[
  { "intent": "account initiative", "query": "..." },
  { "intent": "persona background", "query": "..." },
  { "intent": "reply signal", "query": "..." }
]
