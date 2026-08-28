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

/** Current job, the main personalisation hook for outreach. */
export type ProfileRole = {
  title: string | null;
  company: string | null;
  companyUrl: string | null;
};

export type Profile = {
  platform: "linkedin" | "instagram" | "tiktok";
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

/** Run an actor to completion and return its dataset items. */
export async function runActor<T extends Record<string, unknown>>(
  actorId: string,
  input: Record<string, unknown>,
  maxItems?: number,
): Promise<T[]> {
  // log: null stops the client redirecting actor logs onto our stdout.
  const run = await getClient().actor(actorId).call(input, { maxItems, log: null });
  if (run.status !== "SUCCEEDED")
    throw new Error(`actor ${actorId} finished with status ${run.status}`);

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
