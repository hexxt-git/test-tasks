import { str } from "../util.ts";
import { runActor } from "./client.ts";
import type { SearchResult } from "../search.ts";

const ACTOR = "apify/google-search-scraper";

type RawResult = Record<string, unknown>;
type RawPage = Record<string, unknown> & { organicResults?: RawResult[] };

export async function serpSearch(
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
  // No maxItems: this actor rejects a charge cap below its $0.50 per-run floor.
  const pages = await runActor<RawPage>(ACTOR, {
    queries: query,
    maxPagesPerQuery: 1,
    resultsPerPage: maxResults,
  });

  return pages
    .flatMap((page) => page.organicResults ?? [])
    .map((result) => ({
      title: str(result.title) ?? "",
      url: str(result.url),
      content: str(result.description),
      publishedDate: str(result.date),
    }))
    // A result without a url is not usable; drop it rather than emit a blank.
    .filter((result): result is SearchResult => result.url !== null)
    .slice(0, maxResults);
}
