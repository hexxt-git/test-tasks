const line = (scope: string, kind: string, label: string, detail: string) =>
  console.log(`[${scope} ${kind}] ${label}: ${detail}`);

export const logCall = (label: string, detail: string) => line("TOOL", "CALL", label, detail);
export const logDone = (label: string, detail: string) => line("TOOL", "DONE", label, detail);
export const logFail = (label: string, detail: string) => line("TOOL", "FAIL", label, detail);

/** One tool call can hit several providers; these say which one is being asked. */
export const logProviderCall = (label: string, detail: string) =>
  line("PROVIDER", "CALL", label, detail);
export const logProviderFail = (label: string, detail: string) =>
  line("PROVIDER", "FAIL", label, detail);
