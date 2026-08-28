import {
  normalizeUsername,
  num,
  type Profile,
  type ProfilePost,
  compact,
  runActor,
  str,
} from "./client.ts";

const ACTOR = "scraptik/tiktok-api";
/** Viewer region TikTok serves results for; affects geo-restricted content. */
const REGION = "US";


/** Posts to pull. The posts call is one $0.002 request regardless of count. */
export const MAX_POSTS = 10;

type TikTokUser = Record<string, unknown> & {
  avatar_larger?: { url_list?: unknown[] };
  avatar_168x168?: { url_list?: unknown[] };
};

type Aweme = Record<string, unknown> & {
  statistics?: Record<string, unknown>;
  video?: { cover?: { url_list?: unknown[] } };
  music?: { title?: unknown; author?: unknown };
};

function toPost(aweme: Aweme, handle: string): ProfilePost {
  const stats = aweme.statistics ?? {};
  const music = aweme.music;
  const id = str(aweme.aweme_id);
  const createdAt = num(aweme.create_time);
  return {
    // share_url carries tracking params, so rebuild the canonical permalink.
    url: id ? `https://www.tiktok.com/@${handle}/video/${id}` : null,
    thumbnail: str(aweme.video?.cover?.url_list?.[0]),
    caption: str(aweme.desc),
    likes: num(stats.digg_count),
    comments: num(stats.comment_count),
    views: num(stats.play_count),
    postedAt: createdAt ? new Date(createdAt * 1000).toISOString() : null,
    extras: compact({
      shares: num(stats.share_count),
      isPinned: num(aweme.is_top) === 1,
      region: str(aweme.region),
      music: music && { title: str(music.title), author: str(music.author) },
    }),
  };
}

export async function getTiktokProfile(username: string): Promise<Profile> {
  const handle = normalizeUsername(username);

  // This actor mirrors TikTok's own API: the profile and its posts are separate
  // requests, and the posts one is keyed by the ids the profile call returns.
  const [profileResponse] = await runActor<{ user?: TikTokUser }>(ACTOR, {
    profile_username: handle,
    profile_region: REGION,
  });

  const user = profileResponse?.user;
  if (!user) throw new Error(`no TikTok profile found for @${handle}`);

  const [postsResponse] = await runActor<{ aweme_list?: Aweme[] }>(ACTOR, {
    userPosts_userId: str(user.uid) ?? "",
    userPosts_secUserId: str(user.sec_uid) ?? "",
    userPosts_count: MAX_POSTS,
    userPosts_region: REGION,
  });

  const handleOut = str(user.unique_id) ?? handle;
  const awemes = postsResponse?.aweme_list ?? [];

  return {
    platform: "tiktok",
    username: handleOut,
    name: str(user.nickname),
    url: `https://www.tiktok.com/@${handleOut}`,
    image:
      str(user.avatar_larger?.url_list?.[0]) ??
      str(user.avatar_168x168?.url_list?.[0]),
    bio: str(user.signature),
    // TikTok splits verification across a personal and an institutional field.
    verified: Boolean(str(user.custom_verify) ?? str(user.enterprise_verify_reason)),
    followers: num(user.follower_count),
    following: num(user.following_count),
    // This actor's payload carries no bio-link field at all.
    links: [],
    location: null,
    category: str(user.category),
    isPrivate: num(user.secret) === 1,
    role: null,
    openToWork: null,
    hiring: null,
    postsCount: num(user.aweme_count),
    posts: awemes.slice(0, MAX_POSTS).map((aweme) => toPost(aweme, handleOut)),
    extras: compact({
      totalLikes: num(user.total_favorited),
      accountType: num(user.account_type),
      instagram: str(user.ins_id),
      twitter: str(user.twitter_id),
      youtube: str(user.youtube_channel_id),
    }),
  };
}
