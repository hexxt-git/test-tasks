import {
  compact,
  num,
  runActor,
  str,
  type Business,
  type BusinessReview,
} from "./client.ts";

const ACTOR = "web_wanderer/yelp-reviews-scraper";

/** Reviews to pull. Billed per review; the business fields ride along free. */
export const MAX_REVIEWS = 10;

// Newest first: for outreach, what people are saying now beats what ranked well.
const SORT = "newest";

type RawReview = {
  encid?: string;
  alias?: string;
  name?: string;
  businessUrl?: string;
  businessRating?: number;
  totalReviews?: number;
  primaryPhoto?: string;
  ratingDetail?: Record<string, number>;
  reviewsCountByLanguage?: unknown;
  reviewUrl?: string;
  rating?: number;
  text?: string;
  reviewDate?: string;
  publicReply?: { text?: string } | string;
  photos?: ({ url?: string } | string)[];
  feedback?: { type?: string; count?: number }[];
  author?: { name?: string; review_count?: number };
};

function toReview(review: RawReview): BusinessReview {
  const reply = review.publicReply;
  return {
    url: str(review.reviewUrl),
    rating: num(review.rating),
    text: str(review.text),
    postedAt: str(review.reviewDate),
    author: str(review.author?.name),
    authorReviewCount: num(review.author?.review_count),
    helpful: num(
      review.feedback?.find((item) => item.type === "HELPFUL")?.count,
    ),
    ownerReply: typeof reply === "string" ? str(reply) : str(reply?.text),
    photos: (review.photos ?? [])
      .map((photo) => (typeof photo === "string" ? photo : photo?.url))
      .filter((url): url is string => Boolean(url)),
  };
}

/** Pull the business slug out of a Yelp page URL. */
function toSlug(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new Error(`not a Yelp business url: ${input}`);
  }
  if (!/(^|\.)yelp\.[a-z.]+$/i.test(parsed.hostname))
    throw new Error(`not a yelp.com url: ${input}`);

  const slug = parsed.pathname.match(/^\/biz\/([^/]+)/)?.[1];
  if (!slug) throw new Error(`no business in url: ${input}`);
  return slug;
}

/** Look up a Yelp business by its page URL, with its most recent reviews. */
export async function getYelpBusiness(url: string): Promise<Business> {
  const slug = toSlug(url);
  const pageUrl = `https://www.yelp.com/biz/${slug}`;

  const reviews = await runActor<RawReview>(
    ACTOR,
    {
      biz_urls: [pageUrl],
      reviews_limit: MAX_REVIEWS,
      reviews_sort: SORT,
      // Off by default, and reviewer names are the point for outreach.
      include_personal_data: true,
    },
    MAX_REVIEWS,
  );

  // The business fields ride on each review, so no reviews means no business.
  const [first] = reviews;
  if (!first)
    throw new Error(
      `no Yelp business found at ${pageUrl}; it may not exist or have no reviews`,
    );

  // Guard against a body that is not the business we asked for.
  const alias = str(first.alias);
  if (alias && alias.toLowerCase() !== slug.toLowerCase())
    throw new Error(`asked for ${slug} but got ${alias}; refusing the mismatch`);

  return {
    platform: "yelp",
    id: str(first.encid) ?? slug,
    slug: alias ?? slug,
    name: str(first.name),
    url: str(first.businessUrl) ?? pageUrl,
    image: str(first.primaryPhoto),
    rating: num(first.businessRating),
    reviewCount: num(first.totalReviews),
    reviews: reviews.slice(0, MAX_REVIEWS).map(toReview),
    extras: compact({
      // Star histogram: a 4.5 built on 200 reviews reads differently to one on 4.
      ratingBreakdown: first.ratingDetail,
      reviewsShown: reviews.length,
    }),
  };
}
