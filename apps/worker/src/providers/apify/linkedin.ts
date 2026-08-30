import {
  ActorRunError,
  compact,
  normalizeUsername,
  num,
  runActor,
  str,
  type Profile,
  type ProfilePost,
} from "./client.ts";

const PROFILE_ACTOR = "apimaestro/linkedin-profile-detail";
const POSTS_ACTOR = "apimaestro/linkedin-profile-posts";

export const MAX_POSTS = 4;

/** Public identifier as it appears in a /in/<id> URL. */
export const HANDLE = "^[A-Za-z0-9-]{3,100}$";

type RawProfile = {
  basic_info?: {
    fullname?: string;
    headline?: string;
    public_identifier?: string;
    profile_url?: string;
    profile_picture_url?: string;
    about?: string;
    location?: { full?: string };
    follower_count?: number;
    connection_count?: number;
    current_company?: string;
    current_company_url?: string;
    is_verified?: boolean;
    open_to_work?: boolean;
    is_creator?: boolean;
    is_influencer?: boolean;
    is_premium?: boolean;
    is_top_voice?: boolean;
    top_skills?: unknown;
    created_timestamp?: number;
  };
  experience?: unknown[];
  education?: unknown[];
  featured?: unknown;
  /** Present instead of a profile when the handle does not resolve. */
  message?: string;
};

type RawPost = {
  url?: string;
  text?: string;
  post_type?: string;
  posted_at?: { date?: string; timestamp?: number };
  stats?: { total_reactions?: number; comments?: number; reposts?: number };
  media?: { type?: string; url?: string };
};

function toPost(post: RawPost): ProfilePost {
  const timestamp = num(post.posted_at?.timestamp);
  return {
    url: str(post.url),
    thumbnail: str(post.media?.url),
    caption: str(post.text),
    likes: num(post.stats?.total_reactions),
    comments: num(post.stats?.comments),
    views: null,
    postedAt: timestamp ? new Date(timestamp).toISOString() : null,
    extras: compact({
      type: str(post.post_type),
      reposts: num(post.stats?.reposts),
      mediaType: str(post.media?.type),
    }),
  };
}

export async function getLinkedinProfile(username: string): Promise<Profile> {
  const handle = normalizeUsername(username);

  let raw: RawProfile[];
  try {
    raw = await runActor<RawProfile>(PROFILE_ACTOR, { username: handle }, 1);
  } catch (cause) {
    // An unknown handle aborts the run instead of failing it. Any other
    // status is a real failure and must not be reported as "not found".
    if (cause instanceof ActorRunError && cause.status === "ABORTED")
      throw new Error(`no LinkedIn profile found for ${handle}`);
    throw cause;
  }

  const [profile] = raw;
  if (!profile) throw new Error(`no LinkedIn profile found for ${handle}`);

  const info = profile.basic_info;
  // A run that did reach SUCCEEDED still reports a miss as a result item.
  if (!info)
    throw new Error(
      str(profile.message) ?? `no LinkedIn profile found for ${handle}`,
    );

  // Guard against a body that is not the profile we asked for.
  const identifier = str(info.public_identifier);
  if (!identifier) throw new Error(`no LinkedIn profile found for ${handle}`);
  if (identifier.toLowerCase() !== handle.toLowerCase())
    throw new Error(
      `asked for ${handle} but got ${identifier}; refusing the mismatch`,
    );

  // Posts come from a second actor, only worth paying for once the profile is
  // confirmed. A profile with no posts is still useful, so this is best-effort.
  let posts: RawPost[] = [];
  try {
    posts = await runActor<RawPost>(
      POSTS_ACTOR,
      { username: identifier, limit: MAX_POSTS },
      MAX_POSTS,
    );
  } catch (cause) {
    console.warn(
      `linkedin posts for ${handle} failed:`,
      (cause as Error).message,
    );
  }

  return {
    platform: "linkedin",
    username: identifier,
    name: str(info.fullname),
    url: str(info.profile_url) ?? `https://www.linkedin.com/in/${identifier}`,
    image: str(info.profile_picture_url),
    bio: str(info.about) ?? str(info.headline),
    verified: info.is_verified ?? null,
    followers: num(info.follower_count),
    following: num(info.connection_count),
    postsCount: null,
    links: [],
    location: str(info.location?.full),
    category: str(info.headline),
    isPrivate: null,
    role: info.current_company
      ? {
          title: str(info.headline),
          company: str(info.current_company),
          companyUrl: str(info.current_company_url),
        }
      : null,
    openToWork: info.open_to_work ?? null,
    hiring: null,
    posts: posts.slice(0, MAX_POSTS).map(toPost),
    extras: compact({
      experience: profile.experience,
      education: profile.education,
      featured: profile.featured,
      topSkills: info.top_skills,
      creator: info.is_creator,
      influencer: info.is_influencer,
      premium: info.is_premium,
      topVoice: info.is_top_voice,
      registeredAt: info.created_timestamp
        ? new Date(info.created_timestamp).toISOString()
        : null,
    }),
  };
}
