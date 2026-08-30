import {
  normalizeUsername,
  num,
  type Profile,
  type ProfilePost,
  compact,
  runActor,
  str,
} from "./client.ts";

const ACTOR = "apify/instagram-scraper";

/** Posts to pull. Billed per result; Instagram is the cheapest of the three. */
export const MAX_POSTS = 10;

/** Instagram usernames: letters, digits, dots and underscores, up to 30. */
export const HANDLE = "^@?[A-Za-z0-9._]{1,30}$";

type RawPost = Record<string, unknown>;
type RawProfile = Record<string, unknown> & {
  latestPosts?: RawPost[];
  externalUrls?: { url?: unknown }[];
};

function toPost(post: RawPost): ProfilePost {
  return {
    url: str(post.url),
    thumbnail: str(post.displayUrl),
    caption: str(post.caption),
    likes: num(post.likesCount),
    comments: num(post.commentsCount),
    views: num(post.videoViewCount ?? post.videoPlayCount),
    postedAt: str(post.timestamp),
    extras: compact({
      type: str(post.type),
      shortCode: str(post.shortCode),
      hashtags: post.hashtags,
      mentions: post.mentions,
      childPosts: post.childPosts,
      productType: str(post.productType),
      videoUrl: str(post.videoUrl),
      alt: str(post.alt),
    }),
  };
}

export async function getInstagramProfile(username: string): Promise<Profile> {
  const handle = normalizeUsername(username);

  const [profile] = await runActor<RawProfile>(
    ACTOR,
    {
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: "details",
      resultsLimit: MAX_POSTS,
      addParentData: false,
    },
    1,
  );
  if (!profile) throw new Error(`no Instagram profile found for @${handle}`);

  // The actor reports a missing profile as a result item, not a failed run.
  const error = str(profile.error);
  if (error)
    throw new Error(
      `no Instagram profile for @${handle}: ${str(profile.errorDescription) ?? error}`,
    );

  return {
    platform: "instagram",
    username: str(profile.username) ?? handle,
    name: str(profile.fullName),
    url: str(profile.url) ?? `https://www.instagram.com/${handle}/`,
    image: str(profile.profilePicUrlHD ?? profile.profilePicUrl),
    bio: str(profile.biography),
    verified: typeof profile.verified === "boolean" ? profile.verified : null,
    followers: num(profile.followersCount),
    following: num(profile.followsCount),
    postsCount: num(profile.postsCount),
    links:
      profile.externalUrls
        ?.map((link) => str(link.url))
        .filter((x) => x !== null) ??
      [str(profile.externalUrl)].filter((x) => x !== null),
    location: null,
    category: str(profile.businessCategoryName),
    isPrivate: typeof profile.private === "boolean" ? profile.private : null,
    role: null,
    openToWork: null,
    hiring: null,
    posts: (profile.latestPosts ?? []).slice(0, MAX_POSTS).map(toPost),
    extras: compact({
      isBusinessAccount: profile.isBusinessAccount,
      businessCategory: str(profile.businessCategoryName),
      highlightReelCount: num(profile.highlightReelCount),
      igtvVideoCount: num(profile.igtvVideoCount),
    }),
  };
}
