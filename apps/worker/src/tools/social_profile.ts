import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { Profile } from "../providers/apify/client.ts";
import { logCall, logDone, logFail } from "./log.ts";
import {
  getInstagramProfile,
  HANDLE as INSTAGRAM_HANDLE,
  MAX_POSTS as INSTAGRAM_MAX_POSTS,
} from "../providers/apify/instagram.ts";
import {
  getLinkedinProfile,
  HANDLE as LINKEDIN_HANDLE,
  MAX_POSTS as LINKEDIN_MAX_POSTS,
} from "../providers/apify/linkedin.ts";
import {
  getRedditProfile,
  HANDLE as REDDIT_HANDLE,
  MAX_POSTS as REDDIT_MAX_POSTS,
} from "../providers/apify/reddit.ts";
import {
  getTiktokProfile,
  HANDLE as TIKTOK_HANDLE,
  MAX_POSTS as TIKTOK_MAX_POSTS,
} from "../providers/apify/tiktok.ts";
import {
  getXProfile,
  HANDLE as X_HANDLE,
  MAX_POSTS as X_MAX_POSTS,
} from "../providers/apify/x.ts";

function defineProfileTool(
  platform: string,
  label: string,
  hint: string,
  handle: string,
  maxPosts: number,
  lookup: (username: string) => Promise<Profile>,
) {
  return defineTool({
    name: `${platform}_profile`,
    label,
    description: `Look up a ${label} profile by ${hint}. Returns profile details and the ${maxPosts} latest posts with their engagement counts. Cannot search: take the ${hint} from a profile URL found with web_search first.`,

    parameters: Type.Object({
      // Rejected before the call is billed, so a name or a URL costs nothing.
      username: Type.String({
        pattern: handle,
        description: `${label} ${hint}, without the @. Not a display name, not a URL.`,
      }),
    }),

    execute: async (_, { username }) => {
      const tag = `${platform} profile`;
      logCall(tag, username);

      try {
        const profile = await lookup(username);
        logDone(
          tag,
          `@${profile.username} | ${profile.followers ?? "?"} followers | ${profile.posts.length} posts | links=${profile.links.length}`,
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(profile, null, 2) },
          ],
          details: { posts: profile.posts.length },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logFail(tag, message);
        // Throwing is what marks the result as an error; returned text reads as
        // a successful lookup to the model.
        throw new Error(`${label} lookup failed for ${username}: ${message}`);
      }
    },
  });
}

export const linkedinProfile = defineProfileTool(
  "linkedin",
  "LinkedIn",
  "public identifier",
  LINKEDIN_HANDLE,
  LINKEDIN_MAX_POSTS,
  getLinkedinProfile,
);

export const instagramProfile = defineProfileTool(
  "instagram",
  "Instagram",
  "username",
  INSTAGRAM_HANDLE,
  INSTAGRAM_MAX_POSTS,
  getInstagramProfile,
);

export const tiktokProfile = defineProfileTool(
  "tiktok",
  "TikTok",
  "username",
  TIKTOK_HANDLE,
  TIKTOK_MAX_POSTS,
  getTiktokProfile,
);

export const redditProfile = defineProfileTool(
  "reddit",
  "Reddit",
  "username",
  REDDIT_HANDLE,
  REDDIT_MAX_POSTS,
  getRedditProfile,
);

export const xProfile = defineProfileTool(
  "x",
  "X",
  "handle",
  X_HANDLE,
  X_MAX_POSTS,
  getXProfile,
);
