import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { assertSafeUrl } from "./url-guard.ts";

const MAX_REDIRECTS = 5;

// Node's fetch sends "User-Agent: node", which plenty of sites refuse outright.
// Present as a normal browser navigation instead.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

export type Article = {
  title: string | null;
  byline: string | null;
  siteName: string | null;
  text: string;
};

/** Fetch with every redirect hop re-checked, so a public URL cannot bounce inward. */
async function safeFetch(
  raw: string,
): Promise<{ response: Response; url: URL }> {
  const signal = AbortSignal.timeout(20_000);
  let target = raw;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertSafeUrl(target);
    const response = await fetch(url, {
      signal,
      redirect: "manual",
      headers: BROWSER_HEADERS,
    });

    if (response.status < 300 || response.status >= 400)
      return { response, url };

    const location = response.headers.get("location");
    if (!location)
      throw new Error(`${response.status} redirect without a location`);
    target = new URL(location, url).href;
  }

  throw new Error(`more than ${MAX_REDIRECTS} redirects`);
}

export async function readArticle(url: string): Promise<Article> {
  const { response, url: finalUrl } = await safeFetch(url);
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("html"))
    throw new Error(`unsupported content-type: ${contentType || "unknown"}`);

  // Parse against the final URL so Readability resolves relative links.
  const dom = new JSDOM(await response.text(), { url: finalUrl.href });
  const article = new Readability(dom.window.document).parse();
  if (!article?.textContent?.trim())
    throw new Error("no readable article content found");

  return {
    title: article.title ?? null,
    byline: article.byline ?? null,
    siteName: article.siteName ?? null,
    text: article.textContent.trim(),
  };
}

export function formatArticle(article: Article, url: string): string {
  const header = [
    article.title,
    article.byline && `by ${article.byline}`,
    article.siteName,
    url,
  ].filter(Boolean);
  return `${header.join("\n")}\n\n${article.text}`;
}
