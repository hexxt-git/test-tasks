import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { Profile } from "../providers/apify/client.ts";
import { logCall, logDone, logFail } from "./log.ts";
import {
  getInstagramProfile,
  MAX_POSTS as INSTAGRAM_MAX_POSTS,
} from "../providers/apify/instagram.ts";
import {
  getLinkedinProfile,
  MAX_POSTS as LINKEDIN_MAX_POSTS,
} from "../providers/apify/linkedin.ts";
import {
  getTiktokProfile,
  MAX_POSTS as TIKTOK_MAX_POSTS,
} from "../providers/apify/tiktok.ts";

function defineProfileTool(
  platform: string,
  label: string,
  hint: string,
  maxPosts: number,
  lookup: (username: string) => Promise<Profile>,
) {
  return defineTool({
    name: `${platform}_profile`,
    label,
    description: `Look up a profile on ${label} by ${hint}. Returns JSON with follower counts and the ${maxPosts} latest posts, each with its like and comment counts. do not use as a search function, you must obtain the correct ${hint} first`,

    parameters: Type.Object({
      username: Type.String({
        description: `${label} ${hint}, without the @.`,
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
        return {
          content: [
            { type: "text" as const, text: `Lookup failed: ${message}` },
          ],
          details: { posts: 0 },
        };
      }
    },
  });
}

export const linkedinProfile = defineProfileTool(
  "linkedin",
  "LinkedIn",
  "public identifier",
  LINKEDIN_MAX_POSTS,
  getLinkedinProfile,
);

export const instagramProfile = defineProfileTool(
  "instagram",
  "Instagram",
  "username",
  INSTAGRAM_MAX_POSTS,
  getInstagramProfile,
);

export const tiktokProfile = defineProfileTool(
  "tiktok",
  "TikTok",
  "username",
  TIKTOK_MAX_POSTS,
  getTiktokProfile,
);
