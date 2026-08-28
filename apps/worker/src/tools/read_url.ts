import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { formatArticle, readArticle } from "../providers/readability.ts";
import { logCall, logDone, logFail } from "./log.ts";

export const readUrl = defineTool({
  name: "read_url",
  label: "Read URL",
  description:
    "Fetch a web page and return its main article text, stripped of navigation and ads.",

  parameters: Type.Object({
    url: Type.String({
      description: "Absolute http(s) URL of the page to read.",
    }),
  }),

  execute: async (_, { url }) => {
    logCall("read", url);

    try {
      const article = await readArticle(url);
      logDone("read", `${article.text.length} chars | ${article.title ?? "untitled"}`);
      return {
        content: [{ type: "text" as const, text: formatArticle(article, url) }],
        details: { length: article.text.length },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logFail("read", `${url} -> ${message}`);
      return {
        content: [{ type: "text", text: `Could not read ${url}: ${message}` }],
        details: { length: 0 },
      };
    }
  },
});
