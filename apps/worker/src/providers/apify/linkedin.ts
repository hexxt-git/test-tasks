import {
  normalizeUsername,
  num,
  type Profile,
  type ProfilePost,
  compact,
  runActor,
  str,
} from "./client.ts";

const PROFILE_ACTOR = "harvestapi/linkedin-profile-scraper";
const POSTS_ACTOR = "harvestapi/linkedin-profile-posts";
const SCRAPER_MODE = "Profile details no email ($4 per 1k)";

/** Posts to pull. Billed per post at $0.002, so this is the cost lever here. */
export const MAX_POSTS = 4;

type RawProfile = Record<string, unknown> & {
  location?: { linkedinText?: unknown };
  experience?: RawJob[];
  education?: RawSchool[];
  currentPosition?: {
    position?: unknown;
    companyName?: unknown;
    companyLinkedinUrl?: unknown;
  }[];
};
type RawJob = Record<string, unknown> & { companyLogo?: { url?: unknown } };
type RawSchool = Record<string, unknown> & { schoolLogo?: { url?: unknown } };

type RawPost = Record<string, unknown> & {
  engagement?: Record<string, unknown>;
  postedAt?: Record<string, unknown>;
  postImages?: { url?: unknown }[];
  postVideo?: { thumbnailUrl?: unknown };
};

function toPost(post: RawPost): ProfilePost {
  const engagement = post.engagement ?? {};
  return {
    url: str(post.linkedinUrl),
    thumbnail:
      str(post.postImages?.[0]?.url) ?? str(post.postVideo?.thumbnailUrl),
    caption: str(post.content),
    likes: num(engagement.likes),
    comments: num(engagement.comments),
    views: null, // LinkedIn does not expose post views publicly.
    postedAt: str(post.postedAt?.date),
    extras: compact({
      shares: num(engagement.shares),
      shareUrl: str(post.shareLinkedinUrl),
    }),
  };
}

export async function getLinkedinProfile(username: string): Promise<Profile> {
  const handle = normalizeUsername(username);
  const profileUrl = `https://www.linkedin.com/in/${handle}`;

  // Posts come from a separate actor, and are best-effort: a profile with no
  // posts is still a useful result, so a posts failure must not fail the lookup.
  const [profileResult, postsResult] = await Promise.allSettled([
    runActor<RawProfile>(
      PROFILE_ACTOR,
      { publicIdentifiers: [handle], profileScraperMode: SCRAPER_MODE },
      1,
    ),
    runActor<RawPost>(
      POSTS_ACTOR,
      {
        targetUrls: [profileUrl],
        maxPosts: MAX_POSTS,
        scrapeReactions: false, // like counts are already on engagement
        scrapeComments: false,
      },
      MAX_POSTS,
    ),
  ]);

  if (profileResult.status === "rejected") throw profileResult.reason;
  const [profile] = profileResult.value;
  if (!profile) throw new Error(`no LinkedIn profile found for ${handle}`);

  // The actor reports failures as a result item, not a failed run.
  const error = str(profile.error);
  if (error) throw new Error(error);

  // Guard against a body that is not the profile we asked for.
  const identifier = str(profile.publicIdentifier);
  if (!identifier)
    throw new Error(`no LinkedIn profile found for ${handle}`);
  if (identifier.toLowerCase() !== handle.toLowerCase())
    throw new Error(
      `asked for ${handle} but got ${identifier}; refusing the mismatch`,
    );

  const name =
    str(profile.name) ??
    [str(profile.firstName), str(profile.lastName)].filter(Boolean).join(" ");
  const role = profile.currentPosition?.[0];
  const posts =
    postsResult.status === "fulfilled"
      ? postsResult.value.filter((post) => post.type === "post").map(toPost)
      : [];

  return {
    platform: "linkedin",
    username: identifier,
    name: name || null,
    url: str(profile.linkedinUrl) ?? profileUrl,
    image:
      str((profile.profilePicture as { url?: unknown } | undefined)?.url) ??
      str(profile.photo),
    bio: str(profile.headline ?? profile.about),
    verified: typeof profile.verified === "boolean" ? profile.verified : null,
    followers: num(profile.followerCount ?? profile.followersCount),
    following: num(profile.connectionsCount),
    postsCount: null,
    links: Array.isArray(profile.websites)
      ? (profile.websites as unknown[]).map(str).filter((x) => x !== null)
      : [],
    location: str(profile.location?.linkedinText),
    category: null,
    isPrivate: null,
    role: role
      ? {
          title: str(role.position),
          company: str(role.companyName),
          companyUrl: str(role.companyLinkedinUrl),
        }
      : null,
    openToWork:
      typeof profile.openToWork === "boolean" ? profile.openToWork : null,
    hiring: typeof profile.hiring === "boolean" ? profile.hiring : null,
    posts,
    extras: compact({
      // Logos arrive as { url, sizes[] }; keep just the url.
      experience: (profile.experience ?? []).map((job) => ({
        ...job,
        companyLogo: str(job.companyLogo?.url),
      })),
      education: (profile.education ?? []).map((school) => ({
        ...school,
        schoolLogo: str(school.schoolLogo?.url),
      })),
      skills: profile.skills,
      certifications: profile.certifications,
      languages: profile.languages,
      publications: profile.publications,
      patents: profile.patents,
      courses: profile.courses,
      projects: profile.projects,
      volunteering: profile.volunteering,
      honorsAndAwards: profile.honorsAndAwards,
      organizations: profile.organizations,
      causes: profile.causes,
      recommendations: profile.receivedRecommendations,
      influencer: profile.influencer,
      creator: profile.creator,
      premium: profile.premium,
      registeredAt: str(profile.registeredAt),
    }),
  };
}
