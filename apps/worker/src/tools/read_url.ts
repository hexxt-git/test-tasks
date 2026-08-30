import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import {
  EXTENDED_MAX_CHARS,
  formatArticle,
  formatStructured,
  MAX_CHARS,
  readArticle,
  readStructured,
} from "../providers/readability.ts";
import { logCall, logDone, logFail } from "./log.ts";

export const readUrl = defineTool({
  name: "read_url",
  label: "Read URL",
  description:
    "Fetch a web page and return its main article text, without navigation or ads. For JSON, XML or RSS endpoints set structured_content, which returns the document as served. If a URL is blocked, find a different source rather than another URL on the same site.",

  parameters: Type.Object({
    url: Type.String({
      // Only https survives the url guard, so reject the rest for free.
      pattern: "^https://\\S+$",
      description: "Absolute https URL of the page to read.",
    }),
    structured_content: Type.Optional(
      Type.Boolean({
        description:
          "Read the URL as JSON, XML or a feed instead of extracting article text. Required for API and feed endpoints, and wrong for ordinary web pages.",
      }),
    ),
    extended_content: Type.Optional(
      Type.Boolean({
        description: `Return up to ${EXTENDED_MAX_CHARS} characters instead of ${MAX_CHARS}. Only set this after reading the same page without it and finding the excerpt genuinely too short.`,
      }),
    ),
  }),

  execute: async (_, { url, structured_content, extended_content }) => {
    const mode = [
      structured_content && "structured",
      extended_content && "extended",
    ]
      .filter(Boolean)
      .join(" ");
    logCall("read", mode ? `${url} (${mode})` : url);

    try {
      const doc = structured_content
        ? await readStructured(url)
        : await readArticle(url);
      const text =
        "contentType" in doc
          ? formatStructured(doc, url, extended_content)
          : formatArticle(doc, url, extended_content);
      logDone(
        "read",
        `${text.length} of ${doc.text.length} chars | ${"contentType" in doc ? doc.contentType : (doc.title ?? "untitled")}`,
      );
      return {
        content: [{ type: "text" as const, text }],
        details: { length: text.length },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logFail("read", `${url} -> ${message}`);
      // Throwing is what marks the result as an error; returned text reads as a
      // page that was successfully read.
      throw new Error(`Could not read ${url}: ${message}`);
    }
  },
});
