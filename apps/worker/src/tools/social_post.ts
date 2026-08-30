import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { Post } from "../providers/apify/client.ts";
import { logCall, logDone, logFail } from "./log.ts";
import {
  getRedditPost,
  MAX_COMMENTS,
  POST_REF as REDDIT_POST_REF,
} from "../providers/apify/reddit.ts";
import { getXPost, POST_REF as X_POST_REF } from "../providers/apify/x.ts";

function definePostTool(
  platform: string,
  label: string,
  hint: string,
  ref: string,
  extra: string,
  lookup: (target: string) => Promise<Post>,
) {
  return defineTool({
    name: `${platform}_post`,
    label,
    description: `Read one ${label} post by ${hint}. Returns its text, author and engagement counts${extra}. Cannot search: find the link with web_search, or use ${platform}_profile for someone's recent posts.`,

    parameters: Type.Object({
      // Rejected before the call is billed, so a wrong link costs nothing.
      post: Type.String({ pattern: ref, description: `${label} ${hint}.` }),
    }),

    execute: async (_, { post }) => {
      const tag = `${platform} post`;
      logCall(tag, post);

      try {
        const found = await lookup(post);
        logDone(
          tag,
          `${found.id} by @${found.author?.username ?? "?"} | ${found.likes ?? "?"} likes | ${found.comments ?? "?"} comments | replies=${found.replies.length}`,
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(found, null, 2) },
          ],
          details: { replies: found.replies.length },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logFail(tag, message);
        // Throwing is what marks the result as an error; returned text reads as
        // a successful lookup to the model.
        throw new Error(`${label} lookup failed for ${post}: ${message}`);
      }
    },
  });
}

export const redditPost = definePostTool(
  "reddit",
  "Reddit",
  "post link or comment permalink",
  REDDIT_POST_REF,
  `, plus its top ${MAX_COMMENTS} comments`,
  getRedditPost,
);

export const xPost = definePostTool(
  "x",
  "X",
  "post id or status url",
  X_POST_REF,
  "",
  getXPost,
);
