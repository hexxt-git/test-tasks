const line = (kind: string, label: string, detail: string) =>
  console.log(`[TOOL ${kind}] ${label}: ${detail}`);

export const logCall = (label: string, detail: string) => line("CALL", label, detail);
export const logDone = (label: string, detail: string) => line("DONE", label, detail);
export const logFail = (label: string, detail: string) => line("FAIL", label, detail);
