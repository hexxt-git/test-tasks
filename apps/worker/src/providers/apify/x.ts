import {
  ActorRunError,
  compact,
  num,
  runActor,
  normalizeUsername,
  str,
  type Post,
  type Profile,
  type ProfilePost,
} from "./client.ts";

const ACTOR = "danek/twitter-scraper";

/** X handles: letters, digits and underscore, up to 15. */
export const HANDLE = "^@?[A-Za-z0-9_]{1,15}$";

/** A bare numeric post id, or an x.com / twitter.com status URL. */
export const POST_REF =
  "^(\\d{5,25}|https?://([A-Za-z0-9-]+\\.)*(x|twitter)\\.com/\\S+)$";

type RawAuthor = {
  screen_name?: string;
  name?: string;
  description?: string;
  followers_count?: number;
  /** The avatar is `image` in a post lookup and `avatar` in a profile listing. */
  image?: string;
  avatar?: string;
  blue_verified?: boolean;
  rest_id?: string;
};

type RawPost = {
  /** Present when looked up by id; the profile listing calls it tweet_id. */
  id?: string;
  tweet_id?: string;
  text?: string;
  display_text?: string;
  created_at?: string;
  /** Likes are `likes` by id and `favorites` by profile. */
  likes?: number;
  favorites?: number;
  replies?: number;
  retweets?: number;
  quotes?: number;
  bookmarks?: number;
  /** A string, not a number, in every response seen so far. */
  views?: string | number;
  lang?: string;
  sensitive?: boolean;
  conversation_id?: string;
  in_reply_to_screen_name?: string;
  author?: RawAuthor;
  media?: { url?: string; media_url_https?: string; type?: string }[];
};

/** Pull the post id out of a status URL, or accept a bare numeric id. */
function toPostId(input: string): string {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`not an X post id or url: ${input}`);
  }
  if (!/(^|\.)(x|twitter)\.com$/i.test(parsed.hostname))
    throw new Error(`not an x.com or twitter.com url: ${input}`);

  const id = parsed.pathname.match(/\/status(?:es)?\/(\d+)/)?.[1];
  if (!id) throw new Error(`no post id in url: ${input}`);
  return id;
}

/** Look up one X post by its id or status URL. */
export async function getXPost(idOrUrl: string): Promise<Post> {
  const id = toPostId(idOrUrl);

  let raw: RawPost[];
  try {
    raw = await runActor<RawPost>(ACTOR, { lookup_post_ids: [id], max_posts: 1 }, 1);
  } catch (cause) {
    // An unreachable post aborts the run instead of failing it. Any other
    // status is a real failure and must not be reported as a missing post.
    if (cause instanceof ActorRunError && cause.status === "ABORTED")
      throw new Error(`X post ${id} is unavailable (deleted, private or suspended)`);
    throw cause;
  }

  const [post] = raw;
  if (!post) throw new Error(`no X post found for ${id}`);

  // A post that is deleted or otherwise unavailable comes back as a hollow
  // item carrying only the id, so check for real content rather than trust it.
  const text = str(post.text) ?? str(post.display_text);
  const author = post.author?.screen_name ? post.author : undefined;
  if (!text && !author)
    throw new Error(`X post ${id} is unavailable (deleted, private or suspended)`);

  const handle = str(author?.screen_name);
  const posted = post.created_at ? new Date(post.created_at) : null;
  const media = post.media?.[0];

  return {
    platform: "x",
    id: str(post.id) ?? str(post.tweet_id) ?? id,
    url: handle ? `https://x.com/${handle}/status/${id}` : null,
    thumbnail: str(media?.media_url_https) ?? str(media?.url),
    title: null,
    caption: text,
    likes: num(post.likes) ?? num(post.favorites),
    comments: num(post.replies),
    views: num(Number(post.views)),
    postedAt: posted && !Number.isNaN(posted.valueOf()) ? posted.toISOString() : null,
    author: author
      ? {
          username: handle,
          name: str(author.name),
          image: str(author.image),
          verified: author.blue_verified ?? null,
        }
      : null,
    community: null,
    replies: [],
    extras: compact({
      retweets: num(post.retweets),
      quotes: num(post.quotes),
      bookmarks: num(post.bookmarks),
      language: str(post.lang),
      conversationId: str(post.conversation_id),
      replyingTo: str(post.in_reply_to_screen_name),
      mediaType: str(media?.type),
      sensitive: post.sensitive,
    }),
  };
}

/** Posts to pull for a profile. Billed per result. */
export const MAX_POSTS = 10;

function toProfilePost(post: RawPost): ProfilePost {
  const posted = post.created_at ? new Date(post.created_at) : null;
  const handle = str(post.author?.screen_name);
  const id = str(post.tweet_id) ?? str(post.id);
  return {
    url: handle && id ? `https://x.com/${handle}/status/${id}` : null,
    thumbnail: str(post.media?.[0]?.media_url_https) ?? str(post.media?.[0]?.url),
    caption: str(post.text) ?? str(post.display_text),
    likes: num(post.favorites) ?? num(post.likes),
    comments: num(post.replies),
    views: num(Number(post.views)),
    postedAt: posted && !Number.isNaN(posted.valueOf()) ? posted.toISOString() : null,
    extras: compact({
      retweets: num(post.retweets),
      quotes: num(post.quotes),
      bookmarks: num(post.bookmarks),
    }),
  };
}

/** Look up an X profile by handle, with their most recent posts. */
export async function getXProfile(username: string): Promise<Profile> {
  const handle = normalizeUsername(username);

  const posts = await runActor<RawPost>(
    ACTOR,
    { username: handle, max_posts: MAX_POSTS },
    MAX_POSTS,
  );
  // The actor returns the profile only as an author block on each post, so an
  // empty run means no profile rather than a user who has not posted.
  const author = posts.find((post) => post.author?.screen_name)?.author;
  if (!author)
    throw new Error(`no X profile found for @${handle}`);

  // Guard against a body that is not the profile we asked for.
  const screenName = str(author.screen_name)!;
  if (screenName.toLowerCase() !== handle.toLowerCase())
    throw new Error(
      `asked for ${handle} but got ${screenName}; refusing the mismatch`,
    );

  return {
    platform: "x",
    username: screenName,
    name: str(author.name),
    url: `https://x.com/${screenName}`,
    image: str(author.avatar) ?? str(author.image),
    bio: str(author.description),
    verified: author.blue_verified ?? null,
    followers: num(author.followers_count),
    following: null,
    postsCount: null,
    links: [],
    location: null,
    category: null,
    isPrivate: null,
    role: null,
    openToWork: null,
    hiring: null,
    posts: posts.slice(0, MAX_POSTS).map(toProfilePost),
    extras: compact({ userId: str(author.rest_id) }),
  };
}
