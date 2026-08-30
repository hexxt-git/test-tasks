import {
  compact,
  normalizeUsername,
  num,
  runActor,
  str,
  type Post,
  type PostReply,
  type Profile,
  type ProfilePost,
} from "./client.ts";

const ACTOR = "fatihtahta/reddit-scraper-search-fast";

/** Top comments to pull with the post. Billed per result like the post itself. */
export const MAX_COMMENTS = 10;

/** Activity items to pull for a profile. Billed per result. */
export const MAX_POSTS = 10;

/** Redditor names: letters, digits, underscore and hyphen. `u/` is stripped. */
export const HANDLE = "^(u/)?[A-Za-z0-9_-]{3,20}$";

/** Any reddit.com post or comment permalink. */
export const POST_REF = "^https?://([A-Za-z0-9-]+\\.)*reddit\\.com/\\S+$";

type RawItem = {
  kind?: string;
  id?: string;
  title?: string;
  body?: string;
  author?: string;
  score?: number;
  upvote_ratio?: number;
  num_comments?: number;
  subreddit?: string;
  subreddit_subscribers?: number;
  created_utc?: string;
  url?: string;
  canonical_url?: string;
  permalink?: string;
  thumbnail?: string;
  flair?: string;
  over_18?: boolean;
  locked?: boolean;
  domain?: string;
  is_deleted_or_removed?: boolean;
  total_awards_received?: number;
  author_premium?: boolean;
  postUrl?: string;
};

function toReply(comment: RawItem): PostReply {
  return {
    author: str(comment.author),
    body: str(comment.body),
    likes: num(comment.score),
    postedAt: str(comment.created_utc),
    url: str(comment.canonical_url) ?? str(comment.url),
  };
}

/** Look up one Reddit post by its link or permalink, with its top comments. */
export async function getRedditPost(url: string): Promise<Post> {
  const link = str(url);
  if (!link) throw new Error("url is empty");
  if (!/^https?:\/\/(\w+\.)*reddit\.com\//i.test(link))
    throw new Error(`not a reddit.com url: ${link}`);

  const items = await runActor<RawItem>(
    ACTOR,
    {
      urls: [link],
      maxPosts: 1,
      scrapeComments: true,
      maxComments: MAX_COMMENTS,
    },
    MAX_COMMENTS + 1,
  );

  // Posts and comments land in one dataset, told apart by `kind`.
  const post = items.find((item) => item.kind === "post");
  if (!post) throw new Error(`no Reddit post found at ${link}`);

  const id = str(post.id);
  if (!id) throw new Error(`no Reddit post found at ${link}`);

  const author = str(post.author);
  return {
    platform: "reddit",
    id,
    url: str(post.canonical_url) ?? str(post.url) ?? link,
    // Reddit only exposes a thumbnail for link and image posts.
    thumbnail: /^https?:/i.test(post.thumbnail ?? "") ? str(post.thumbnail) : null,
    title: str(post.title),
    caption: str(post.body),
    likes: num(post.score),
    comments: num(post.num_comments),
    views: null,
    postedAt: str(post.created_utc),
    author: author
      ? {
          username: author,
          name: null,
          image: null,
          verified: null,
        }
      : null,
    community: str(post.subreddit),
    replies: items
      .filter((item) => item.kind === "comment" && !item.is_deleted_or_removed)
      .slice(0, MAX_COMMENTS)
      .map(toReply),
    extras: compact({
      permalink: str(post.permalink),
      flair: str(post.flair),
      upvoteRatio: num(post.upvote_ratio),
      subredditSubscribers: num(post.subreddit_subscribers),
      awards: num(post.total_awards_received),
      linkDomain: str(post.domain),
      nsfw: post.over_18,
      locked: post.locked,
    }),
  };
}


function toProfilePost(post: RawItem): ProfilePost {
  return {
    url: str(post.canonical_url) ?? str(post.url),
    thumbnail: /^https?:/i.test(post.thumbnail ?? "") ? str(post.thumbnail) : null,
    caption: str(post.title) ?? str(post.body),
    likes: num(post.score),
    comments: num(post.num_comments),
    views: null,
    postedAt: str(post.created_utc),
    extras: compact({
      subreddit: str(post.subreddit),
      flair: str(post.flair),
      body: str(post.title) ? str(post.body) : null,
    }),
  };
}

/**
 * Look up a Redditor by username. Reddit exposes no karma or bio through this
 * actor, so the profile is built from their recent public activity.
 */
export async function getRedditProfile(username: string): Promise<Profile> {
  const handle = normalizeUsername(username).replace(/^u\//i, "");
  const url = `https://www.reddit.com/user/${handle}/`;

  const items = await runActor<RawItem>(
    ACTOR,
    { urls: [url], maxPosts: MAX_POSTS, scrapeComments: false },
    MAX_POSTS,
  );
  // A missing user and a user with no public activity look identical here, so
  // say which is possible rather than inventing an empty profile.
  if (!items.length)
    throw new Error(
      `no public activity for u/${handle}; the account may not exist`,
    );

  // Guard against a body that is not the user we asked for.
  const author = str(items.find((item) => item.author)?.author);
  if (author && author.toLowerCase() !== handle.toLowerCase())
    throw new Error(`asked for ${handle} but got ${author}; refusing the mismatch`);

  const posts = items.filter((item) => item.kind === "post");
  const comments = items.filter((item) => item.kind === "comment");

  return {
    platform: "reddit",
    username: author ?? handle,
    name: null,
    url,
    image: null,
    bio: null,
    verified: null,
    followers: null,
    following: null,
    postsCount: null,
    links: [],
    location: null,
    category: null,
    isPrivate: null,
    role: null,
    openToWork: null,
    hiring: null,
    posts: posts.map(toProfilePost),
    extras: compact({
      // Where someone spends their time is the useful signal Reddit does give.
      subreddits: [...new Set(items.map((item) => item.subreddit).filter(Boolean))],
      premium: items.find((item) => item.author_premium !== undefined)?.author_premium,
      recentComments: comments.map((comment) => ({
        body: str(comment.body),
        score: num(comment.score),
        subreddit: str(comment.subreddit),
        postUrl: str(comment.postUrl),
        postedAt: str(comment.created_utc),
      })),
    }),
  };
}
