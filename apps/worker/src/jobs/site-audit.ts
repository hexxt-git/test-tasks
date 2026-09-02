import type { Job as QueueJob } from "bullmq";
import type { AuditJob, AuditReport } from "@repo/queue";
import { assertSafeUrl } from "../providers/url-guard.ts";

export const siteAudit = async (job: QueueJob<AuditJob>) => {
  const url = await assertSafeUrl(job.data.url);

  const report: AuditReport = {
    url: url.href,
    checks: {},
    review: null,
  };

  await job.updateProgress({ report });
  return `audited ${report.url}`;
};
