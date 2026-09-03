import {
  compact,
  normalizeUsername,
  num,
  runActor,
  str,
  type Profile,
  type ProfilePost,
} from "./client.ts";

const COMPANY_ACTOR = "apimaestro/linkedin-company-detail";
const POSTS_ACTOR = "apimaestro/linkedin-company-posts";

export const MAX_POSTS = 4;

/** Universal name as it appears in a /company/<slug> URL. */
export const HANDLE = "^[A-Za-z0-9._-]{1,100}$";

type Address = {
  country?: string;
  state?: string;
  city?: string;
  postal_code?: string;
  line1?: string;
  line2?: string;
  region?: string;
};

type RawCompany = {
  basic_info?: {
    name?: string;
    universal_name?: string;
    description?: string;
    website?: string;
    linkedin_url?: string;
    specialties?: unknown;
    industries?: string[];
    is_verified?: boolean;
    founded_info?: { year?: number | null };
    page_type?: string;
  };
  tagline?: string;
  phone?: string;
  company_urn?: string;
  stats?: {
    employee_count?: number;
    follower_count?: number;
    employee_count_range?: { start?: number | null; end?: number | null };
  };
  locations?: { headquarters?: Address; offices?: Address[] };
  media?: { logo_url?: string; cover_url?: string };
  funding?: unknown;
  links?: { website?: string; linkedin?: string; crunchbase?: string };
  call_to_action?: { url?: string };
  affiliated_companies?: unknown;
  similar_companies?: unknown;
  hashtags?: unknown;
  corporate_relationships?: unknown;
};

type RawPost = {
  post_url?: string;
  text?: string;
  post_type?: string;
  posted_at?: { date?: string; timestamp?: number };
  stats?: { total_reactions?: number; comments?: number; reposts?: number };
  media?: { type?: string; items?: { url?: string }[] };
};

/** "1 Microsoft Way, Redmond, Washington, US" from the parts that are present. */
function toAddress(address: Address | undefined): string | null {
  if (!address) return null;
  return (
    [address.line1, address.city, address.state, address.country]
      .map(str)
      .filter(Boolean)
      .join(", ") || null
  );
}

function toPost(post: RawPost): ProfilePost {
  const timestamp = num(post.posted_at?.timestamp);
  return {
    url: str(post.post_url),
    thumbnail: str(post.media?.items?.[0]?.url),
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

export async function getLinkedinCompany(username: string): Promise<Profile> {
  const handle = normalizeUsername(username);

  const raw = await runActor<RawCompany>(
    COMPANY_ACTOR,
    { identifier: [handle] },
    1,
  );

  const [company] = raw;
  // A miss still succeeds, and comes back as an item with every field blanked.
  if (!company) throw new Error(`no LinkedIn company found for ${handle}`);

  const info = company.basic_info;
  const identifier = str(info?.universal_name);
  if (!identifier) throw new Error(`no LinkedIn company found for ${handle}`);

  // Guard against a body that is not the company we asked for.
  if (identifier.toLowerCase() !== handle.toLowerCase())
    throw new Error(
      `asked for ${handle} but got ${identifier}; refusing the mismatch`,
    );

  // Posts come from a second actor, only worth paying for once the company is
  // confirmed. A page with no posts is still useful, so this is best-effort.
  let posts: RawPost[] = [];
  try {
    posts = await runActor<RawPost>(
      POSTS_ACTOR,
      { company_name: identifier, limit: MAX_POSTS },
      MAX_POSTS,
    );
  } catch (cause) {
    console.warn(
      `linkedin company posts for ${handle} failed:`,
      (cause as Error).message,
    );
  }

  const website = str(info?.website) ?? str(company.links?.website);

  return {
    platform: "linkedin_company",
    username: identifier,
    name: str(info?.name),
    url:
      str(info?.linkedin_url) ??
      `https://www.linkedin.com/company/${identifier}`,
    image: str(company.media?.logo_url),
    bio: str(info?.description) ?? str(company.tagline),
    verified: info?.is_verified ?? null,
    followers: num(company.stats?.follower_count),
    following: null,
    postsCount: null,
    links: [
      ...new Set(
        [website, str(company.call_to_action?.url)].filter(
          (link): link is string => !!link,
        ),
      ),
    ],
    location: toAddress(company.locations?.headquarters),
    category: info?.industries?.map(str).filter(Boolean).join(", ") || null,
    isPrivate: null,
    role: null,
    openToWork: null,
    hiring: null,
    posts: posts.slice(0, MAX_POSTS).map(toPost),
    extras: compact({
      tagline: str(company.tagline),
      phone: str(company.phone),
      employeeCount: num(company.stats?.employee_count),
      employeeCountRange: company.stats?.employee_count_range,
      foundedYear: num(info?.founded_info?.year),
      industries: info?.industries,
      specialties: info?.specialties,
      pageType: str(info?.page_type),
      headquarters: company.locations?.headquarters,
      offices: company.locations?.offices,
      funding: company.funding,
      affiliatedCompanies: company.affiliated_companies,
      similarCompanies: company.similar_companies,
      corporateRelationships: company.corporate_relationships,
      hashtags: company.hashtags,
      coverImage: str(company.media?.cover_url),
      crunchbase: str(company.links?.crunchbase),
      urn: str(company.company_urn),
    }),
  };
}
