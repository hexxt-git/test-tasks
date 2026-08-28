export const MAX_RESULTS = 10;

export type SearchResult = {
  title: string;
  url: string;
  content: string | null;
  publishedDate: string | null;
};

function formatResult(result: SearchResult, index: number): string {
  const lines = [`${index + 1}. ${result.title}`, `   ${result.url}`];
  if (result.publishedDate) lines.push(`   published: ${result.publishedDate}`);
  if (result.content) lines.push(`   ${result.content}`);
  return lines.join("\n");
}

export function formatResults(results: SearchResult[], query: string): string {
  if (!results.length) return `No results for: ${query}`;
  return results.map(formatResult).join("\n\n");
}
