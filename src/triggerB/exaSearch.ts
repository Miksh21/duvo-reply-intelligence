import { exaSearch } from "../integrations/exa";
import type { ExaQuery, ExaQueryResult } from "../types";

/**
 * Run the 3 Exa queries in parallel. Per-query failures degrade to empty
 * results (→ a thinner brief) rather than sinking the whole run.
 */
export async function runExaSearches(queries: ExaQuery[]): Promise<ExaQueryResult[]> {
  return Promise.all(
    queries.map(async (q): Promise<ExaQueryResult> => {
      try {
        const results = await exaSearch(q.query);
        console.log(`   Exa · "${q.query}" → ${results.length} result(s)`);
        return { intent: q.intent, query: q.query, results };
      } catch (err) {
        console.warn(`   Exa · "${q.query}" FAILED — ${(err as Error).message}`);
        return { intent: q.intent, query: q.query, results: [] };
      }
    }),
  );
}
