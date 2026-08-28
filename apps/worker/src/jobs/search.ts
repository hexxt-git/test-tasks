import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import { readUrl } from "../tools/read_url.ts";
import {
  instagramProfile,
  linkedinProfile,
  tiktokProfile,
} from "../tools/social_profile.ts";
import { webSearch } from "../tools/web_search.ts";

const SYSTEM_PROMPT = `You are a research assistant. Answer the user's question, using web_search, read_url and available tools when you need current information.

do not use web_search as an oracle tool, use it only to find pages to read from. read pages such as reviews and business websites for information the search can't surface.

answer the user questions quickly and do not spend a long time on research.

if you can't find information, do not keep querying for too long. limit to around 5 queries per piece of information and read the web pages you already have.

make sure to never confuse two separate businesses or locations even if they have similar names or are on similar address. be sure you are talking about the one the user mentions.

the profile tools take an exact handle, they cannot search. never guess or invent a handle, and never try variations of a name to see which one sticks. to find someone's profile, search the web for it (for example: site:linkedin.com/in "their name" company) and take the handle out of the profile url in the results. only then call the profile tool. if search does not turn up a profile url, say the profile was not found rather than guessing.`;

export async function runAgent(prompt: string): Promise<string> {
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
    customTools: [
      webSearch,
      readUrl,
      linkedinProfile,
      instagramProfile,
      tiktokProfile,
    ],
    sessionManager: SessionManager.inMemory(),
  });

  let output = "";

  const unsubscribe = session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      output += event.assistantMessageEvent.delta;
    }
  });

  try {
    await session.prompt(prompt);
    return output;
  } finally {
    unsubscribe();
    session.dispose();
  }
}

const output = await runAgent(
  "who are the staff and who owns People Tax Solutions (The Bronx Office) - Tax Preparation",
);

console.log(output);
