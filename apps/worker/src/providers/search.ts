import { logProviderCall, logProviderFail } from "../tools/log.ts";
import { serpSearch } from "./apify/serp.ts";
import { searxngConfigured, searxngSearch } from "./searxng.ts";

export const MAX_RESULTS = 10;

export type SearchResult = {
  title: string;
  url: string;
  content: string | null;
  publishedDate: string | null;
};

function formatResult(result: SearchResult, index: number): string {
  const lines = [`${index + 1}. ${result.title}`, `   ${result.url}`];
  if (result.publishedDate) lines.push(`   published: ${result.publishedDate}`);
  if (result.content) lines.push(`   ${result.content}`);
  return lines.join("\n");
}

export function formatResults(results: SearchResult[], query: string): string {
  if (!results.length) return `No results for: ${query}`;
  return results.map(formatResult).join("\n\n");
}

/** SearXNG first, Apify's paid SERP actor as the fallback. An unconfigured,
 * broken or empty SearXNG instance all mean "ask the paid provider". */
export async function search(
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
  if (searxngConfigured()) {
    logProviderCall("searxng", `"${query}"`);
    try {
      const results = await searxngSearch(query, maxResults);
      if (results.length) return results;
      logProviderFail("searxng", "0 results, falling back to apify");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logProviderFail("searxng", `${message}, falling back to apify`);
    }
  }

  logProviderCall("apify serp", `"${query}"`);
  return serpSearch(query, maxResults);
}
