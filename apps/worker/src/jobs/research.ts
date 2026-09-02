import type { Job as QueueJob } from "bullmq";
import type { ResearchJob, Turn } from "@repo/queue";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import { yelpBusiness } from "../tools/business.ts";
import { readUrl } from "../tools/read_url.ts";
import { redditPost, xPost } from "../tools/social_post.ts";
import {
  instagramProfile,
  linkedinProfile,
  redditProfile,
  tiktokProfile,
  xProfile,
} from "../tools/social_profile.ts";
import { webSearch } from "../tools/web_search.ts";

const SYSTEM_PROMPT = `You are a research assistant. Answer the user's question, using the tools when you need current information.

do not use web_search as an oracle tool, use it only to find pages to read from. read pages such as reviews and business websites for information the search can't surface.

answer the user questions quickly and do not spend a long time on research.

if you can't find information, do not keep querying for too long. limit to around 5 queries per piece of information and read the web pages you already have.

make sure to never confuse two separate businesses or locations even if they have similar names or are on similar address. be sure you are talking about the one the user mentions.

a link to reddit, x, linkedin, instagram or tiktok is read with that platform's post or profile tool, never with read_url; read_url is for ordinary web pages. find those links with web_search first.

the profile tools take an exact handle, they cannot search. never guess or invent a handle, and never try variations of a name to see which one sticks. to find someone's profile, search the web for it (for example: site:linkedin.com/in "their name" company) and take the handle out of the profile url in the results. only then call the profile tool. if search does not turn up a profile url, say the profile was not found rather than guessing.`;

const tools = [
  webSearch,
  readUrl,
  linkedinProfile,
  instagramProfile,
  tiktokProfile,
  redditProfile,
  xProfile,
  redditPost,
  xPost,
  yelpBusiness,
];

const labels = new Map(tools.map((tool) => [tool.name, tool.label]));

type Block =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | {
      type: "toolCall";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    };

/** Some agent messages (bash execution) carry no content array at all. */
const blocksOf = (message: object): Block[] => {
  const content = (message as { content?: unknown }).content;
  return Array.isArray(content) ? (content as Block[]) : [];
};

const joinText = (blocks: { type: string; text?: string }[]) =>
  blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

export const research = async (job: QueueJob<ResearchJob>) => {
  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
    systemPrompt: SYSTEM_PROMPT,
    noContextFiles: true,
    noSkills: true,
    noExtensions: true,
    noPromptTemplates: true,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    resourceLoader,
    model: getBuiltinModel("deepseek", "deepseek-v4-pro"),
    thinkingLevel: "high",
    noTools: "builtin",
    customTools: tools,
    sessionManager: SessionManager.inMemory(),
  });

  let answer = "";
  let index = 0;
  // The subscriber is synchronous; chain the async reports so they stay ordered.
  let reported: Promise<unknown> = Promise.resolve();

  const unsubscribe = session.subscribe((event) => {
    if (event.type !== "turn_end") return;

    const blocks = blocksOf(event.message);
    const text = joinText(blocks);
    if (text.trim()) answer = text;

    const turn: Turn = {
      index: index++,
      thinking: blocks
        .filter((block) => block.type === "thinking")
        .map((block) => block.thinking)
        .join(""),
      text,
      tools: blocks
        .filter((block) => block.type === "toolCall")
        .map((call) => {
          const result = event.toolResults.find(
            (r) => r.toolCallId === call.id,
          );
          return {
            name: call.name,
            label: labels.get(call.name) ?? call.name,
            args: call.arguments,
            result: joinText(result?.content ?? []),
            isError: Boolean(result?.isError),
          };
        }),
    };

    reported = reported.then(() => job.updateProgress({ turn }));
  });

  try {
    await session.prompt(job.data.question);
    await reported;
    return answer.trim() || "no answer";
  } finally {
    unsubscribe();
    session.dispose();
  }
};
