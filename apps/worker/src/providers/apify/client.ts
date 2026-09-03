import { ApifyClient } from "apify-client";
export { num, str } from "../util.ts";

/** Platform-specific fields kept verbatim. Shape varies by platform. */
export type Extras = Record<string, unknown>;

export type ProfilePost = {
  url: string | null;
  /** Thumbnail / preview image for the post, when the platform exposes one. */
  thumbnail: string | null;
  caption: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  postedAt: string | null;
  extras: Extras;
};

/** A review left on a business by a customer. */
export type BusinessReview = {
  url: string | null;
  rating: number | null;
  text: string | null;
  postedAt: string | null;
  author: string | null;
  /** How many reviews the author has written; a one-review account is noise. */
  authorReviewCount: number | null;
  helpful: number | null;
  /** The owner's public response, the clearest sign they read their reviews. */
  ownerReply: string | null;
  photos: string[];
};

/** A business listing, looked up by its page URL. */
export type Business = {
  platform: "yelp";
  id: string;
  slug: string;
  name: string | null;
  url: string | null;
  image: string | null;
  rating: number | null;
  reviewCount: number | null;
  reviews: BusinessReview[];
  extras: Extras;
};

/** Whoever wrote a post, as returned alongside a single-post lookup. */
export type PostAuthor = {
  username: string | null;
  name: string | null;
  image: string | null;
  verified: boolean | null;
};

/** A reply or comment under a post. */
export type PostReply = {
  author: string | null;
  body: string | null;
  likes: number | null;
  postedAt: string | null;
  url: string | null;
};

/** A post fetched on its own by link or id, rather than through a profile. */
export type Post = ProfilePost & {
  platform: "reddit" | "x";
  id: string;
  /** Reddit posts have a title; X posts do not. */
  title: string | null;
  author: PostAuthor | null;
  /** Subreddit the post lives in, or null off Reddit. */
  community: string | null;
  replies: PostReply[];
};

/** Current job, the main personalisation hook for outreach. */
export type ProfileRole = {
  title: string | null;
  company: string | null;
  companyUrl: string | null;
};

export type Profile = {
  platform:
    | "linkedin"
    /** A LinkedIn company page, not a member. */
    | "linkedin_company"
    | "instagram"
    | "tiktok"
    | "reddit"
    | "x";
  username: string;
  name: string | null;
  url: string | null;
  /** Profile picture / avatar. */
  image: string | null;
  bio: string | null;
  verified: boolean | null;
  followers: number | null;
  following: number | null;
  postsCount: number | null;
  /** External links from the bio: the usual way to reach someone off-platform. */
  links: string[];
  location: string | null;
  /** Self-declared creator or business category. */
  category: string | null;
  isPrivate: boolean | null;
  role: ProfileRole | null;
  /** LinkedIn-only intent signals; null on other platforms. */
  openToWork: boolean | null;
  hiring: boolean | null;
  posts: ProfilePost[];
  extras: Extras;
};

let client: ApifyClient | undefined;

function getClient(): ApifyClient {
  if (!client) {
    const token = process.env.APIFY_TOKEN;
    if (!token) throw new Error("APIFY_TOKEN is not set");
    client = new ApifyClient({ token });
  }
  return client;
}

/** An actor run that did not finish cleanly. Carries the status so callers can
 * tell apart the ones their actor uses to signal something. */
export class ActorRunError extends Error {
  status: string;

  constructor(actorId: string, status: string) {
    super(`actor ${actorId} finished with status ${status}`);
    this.status = status;
  }
}

/** Run an actor to completion and return its dataset items. */
export async function runActor<T extends Record<string, unknown>>(
  actorId: string,
  input: Record<string, unknown>,
  maxItems?: number,
): Promise<T[]> {
  // log: null stops the client redirecting actor logs onto our stdout.
  const run = await getClient().actor(actorId).call(input, { maxItems, log: null });
  if (run.status !== "SUCCEEDED") throw new ActorRunError(actorId, run.status);

  const { items } = await getClient()
    .dataset<T>(run.defaultDatasetId)
    .listItems();
  return items;
}

/** Drop keys with nothing in them, so extras stay small and predictable. */
export function compact(source: Extras): Extras {
  const out: Extras = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (typeof value === "string" && !value.trim()) continue;
    out[key] = value;
  }
  return out;
}

/** Strip the leading @ and any surrounding whitespace from a handle. */
export function normalizeUsername(username: string): string {
  const clean = username.trim().replace(/^@+/, "");
  if (!clean) throw new Error("username is empty");
  return clean;
}
