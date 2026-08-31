import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import { assertSafeUrl } from "./url-guard.ts";

const MAX_REDIRECTS = 5;

/** Characters returned per read, and the ceiling an extended read may ask for. */
export const MAX_CHARS = 12_000;
export const EXTENDED_MAX_CHARS = 64_000;

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
  // Naming the way through beats naming the mime type: a bare "unsupported
  // content-type" reads as "try another URL" and invites a hunt for a readable
  // shape of the same endpoint.
  if (!contentType.includes("html"))
    throw new Error(
      `${contentType.split(";")[0] || "unknown content-type"} is not a web page. Call again with structured_content: true to read JSON, XML or feeds as they are served.`,
    );

  const { document } = parseHTML(await response.text());
  const article = await Defuddle(document, finalUrl.href, {
    markdown: true,
    // Extraction must stay within the page fetched and checked above. Defuddle's
    // async fallbacks may otherwise call platform-specific third-party APIs.
    useAsync: false,
  });
  const text = article.content.trim();
  if (!text)
    throw new Error("no readable article content found");

  return {
    title: article.title || null,
    byline: article.author || null,
    siteName: article.site || null,
    text,
  };
}

/** Cut on a line break when there is one close by, never mid-word. */
function cut(text: string, limit: number): string {
  const head = text.slice(0, limit);
  const near = (index: number) => (index > limit * 0.8 ? index : -1);
  const at = Math.max(near(head.lastIndexOf("\n\n")), near(head.lastIndexOf("\n")));
  return at > 0 ? head.slice(0, at) : head;
}

/** One window of a document, plus the notice it owes when there is more. */
function windowed(text: string, extended: boolean) {
  const limit = extended ? EXTENDED_MAX_CHARS : MAX_CHARS;
  const body = text.length > limit ? cut(text, limit) : text;

  // Only paid for when the document actually overflows.
  const notice =
    body.length < text.length &&
    `[showing the first ${body.length} of ${text.length} characters${
      extended
        ? "; this is the most this tool can return, so work with this excerpt"
        : "; if this excerpt does not answer the question, read it again with extended_content: true"
    }]`;

  return { body, notice };
}

export function formatArticle(
  article: Article,
  url: string,
  extended = false,
): string {
  const { body, notice } = windowed(article.text, extended);
  const header = [
    article.title,
    article.byline && `by ${article.byline}`,
    article.siteName,
    url,
    notice,
  ].filter(Boolean);

  return `${header.join("\n")}\n\n${body}`;
}

export type StructuredDocument = { contentType: string; text: string };

// xhtml carries both words and belongs to the article path, so html wins first.
const STRUCTURED = /json|xml/;

/** Fetch JSON, XML or a feed and hand it back as served, with no extraction. */
export async function readStructured(url: string): Promise<StructuredDocument> {
  const { response } = await safeFetch(url);
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);

  const contentType =
    (response.headers.get("content-type") ?? "").split(";")[0] || "unknown";
  if (contentType.includes("html") || !STRUCTURED.test(contentType))
    throw new Error(
      `${contentType} is not structured data. Read this URL with structured_content off to get its article text.`,
    );

  return { contentType, text: (await response.text()).trim() };
}

export function formatStructured(
  doc: StructuredDocument,
  url: string,
  extended = false,
): string {
  const { body, notice } = windowed(doc.text, extended);
  return `${[doc.contentType, url, notice].filter(Boolean).join("\n")}\n\n${body}`;
}
