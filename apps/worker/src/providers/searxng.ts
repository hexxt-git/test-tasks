import { str } from "./util.ts";
import type { SearchResult } from "./search.ts";

type RawResult = Record<string, unknown>;

/** Whether an instance is configured at all; the caller falls back when not. */
export function searxngConfigured(): boolean {
  return Boolean(process.env.SEARXNG_ENDPOINT);
}

export async function searxngSearch(
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
  const endpoint = process.env.SEARXNG_ENDPOINT;
  if (!endpoint) throw new Error("SEARXNG_ENDPOINT is not set");

  const url = new URL("search", endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");

  const key = process.env.SEARXNG_API_KEY;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: {
      Accept: "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);

  const body = (await response.json()) as { results?: RawResult[] };

  return (body.results ?? [])
    .map((result) => ({
      title: str(result.title) ?? "",
      url: str(result.url),
      content: str(result.content),
      publishedDate: str(result.publishedDate),
    }))
    // A result without a url is not usable; drop it rather than emit a blank.
    .filter((result): result is SearchResult => result.url !== null)
    .slice(0, maxResults);
}
