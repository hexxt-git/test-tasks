import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { logCall, logDone, logFail } from "./log.ts";
import { getYelpBusiness, MAX_REVIEWS } from "../providers/apify/yelp.ts";

export const yelpBusiness = defineTool({
  name: "yelp_business",
  label: "Yelp",
  description: `Read a Yelp business listing by its page url. Returns JSON with the rating, review count, star breakdown and the ${MAX_REVIEWS} most recent reviews, each with its author and any owner reply. use this instead of read_url for yelp.com, which blocks direct reads.`,

  parameters: Type.Object({
    url: Type.String({
      description: "Yelp business page url, like https://www.yelp.com/biz/<name>.",
    }),
  }),

  execute: async (_, { url }) => {
    const tag = "yelp business";
    logCall(tag, url);

    try {
      const business = await getYelpBusiness(url);
      logDone(
        tag,
        `${business.name} | ${business.rating ?? "?"} stars | ${business.reviewCount ?? "?"} reviews | showing ${business.reviews.length}`,
      );
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(business, null, 2) },
        ],
        details: { reviews: business.reviews.length },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logFail(tag, message);
      return {
        content: [{ type: "text" as const, text: `Lookup failed: ${message}` }],
        details: { reviews: 0 },
      };
    }
  },
});
