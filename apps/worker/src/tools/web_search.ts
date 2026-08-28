import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { serpSearch } from "../providers/apify/serp.ts";
import { formatResults, MAX_RESULTS } from "../providers/search.ts";
import { logCall, logDone, logFail } from "./log.ts";

export const webSearch = defineTool({
  name: "web_search",
  label: "Web Search",
  description: `Search the web. Returns up to ${MAX_RESULTS} results as title, URL, and snippet. do not use as an oracle to answer arbitrary questions, use to find websites.`,

  parameters: Type.Object({
    query: Type.String({
      description: "Keyword-style query, as typed into a search engine.",
    }),
  }),

  execute: async (_, { query }) => {
    const label = "search";
    logCall(label, `"${query.replaceAll(/\s+/g, " ")}"`);

    try {
      const results = await serpSearch(query, MAX_RESULTS);
      logDone(
        label,
        results.length
          ? `${results.length} results | ${results.map((r) => new URL(r.url).hostname).join(", ")}`
          : "0 results",
      );
      return {
        content: [
          { type: "text" as const, text: formatResults(results, query) },
        ],
        details: { count: results.length },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logFail(label, message);
      return {
        content: [{ type: "text" as const, text: `Search failed: ${message}` }],
        details: { count: 0 },
      };
    }
  },
});
