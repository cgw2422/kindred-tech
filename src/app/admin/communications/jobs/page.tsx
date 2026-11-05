import type { Metadata } from "next";
import Link from "next/link";
import type { JobStatus } from "@prisma/client";
import { Badge, EmptyState, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { humanize } from "@/components/status";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";
import { PAGE_SIZE, pageFromParam } from "@/lib/admin/common";
import { ActionForm } from "../../_config/ActionForm";
import { RowAction } from "../../_config/RowAction";
import { COMMS_NAV, Pagination, SubNav, sp as one } from "../../_config/nav";
import { jobStatusTone } from "../../_config/tones";
import { retryJobAction, runJobsNowAction } from "../actions";

export const metadata: Metadata = { title: "Background Jobs" };

const STATUSES: JobStatus[] = ["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "DEAD"];

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("communications:view", "/admin/communications/jobs");
  const raw = await searchParams;
  const status = one(raw.status);
  const page = pageFromParam(raw.page);
  const canManage = can(user.role, "settings:manage");
  const tz = (await getSettings("business")).timeZone;
  const where = status && (STATUSES as string[]).includes(status) ? { status: status as JobStatus } : {};
  const [jobs, total, counts] = await Promise.all([
    prisma.job.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.job.count({ where }),
    prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countOf = (s: JobStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div>
      <PageHeader title="Communications" description="Background jobs send emails and other automatic tasks. Failed jobs retry automatically with increasing delays." />
      <SubNav items={COMMS_NAV} current="/admin/communications/jobs" label="Communications sections" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
          <Link href="/admin/communications/jobs" className={`rounded-full border px-3 py-1.5 text-sm font-semibold no-underline ${!status ? "border-navy bg-navy text-white" : "border-line bg-white"}`}>
            All
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/communications/jobs?status=${s}`}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold no-underline ${status === s ? "border-navy bg-navy text-white" : "border-line bg-white"}`}
            >
              {humanize(s)} ({countOf(s)})
            </Link>
          ))}
        </nav>
        {canManage && (
          <ActionForm action={runJobsNowAction} inline className="flex flex-wrap items-center">
            <SubmitButton variant="secondary" pendingText="Running...">
              Run due jobs now
            </SubmitButton>
          </ActionForm>
        )}
      </div>
      {!canManage && (
        <div className="mb-4">
          <Notice>Only owners and admins can retry or run jobs.</Notice>
        </div>
      )}

      {jobs.length === 0 ? (
        <EmptyState title="No jobs" />
      ) : (
        <Table caption="Background jobs">
          <thead>
            <tr>
              <Th>Created</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Attempts</Th>
              <Th>Next run / completed</Th>
              <Th>Last error</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const commId = (j.payload as { communicationId?: unknown } | null)?.communicationId;
              return (
                <tr key={j.id}>
                  <Td className="whitespace-nowrap text-sm">{formatDateTime(j.createdAt, tz)}</Td>
                  <Td>
                    <code className="text-sm">{j.type}</code>
                    {typeof commId === "string" && (
                      <div className="text-sm">
                        <Link href={`/admin/communications/${commId}`}>View email</Link>
                      </div>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={jobStatusTone[j.status]}>{humanize(j.status)}</Badge>
                  </Td>
                  <Td>
                    {j.attempts} / {j.maxAttempts}
                  </Td>
                  <Td className="whitespace-nowrap text-sm">{j.completedAt ? formatDateTime(j.completedAt, tz) : formatDateTime(j.runAt, tz)}</Td>
                  <Td className="max-w-sm break-words text-sm">{j.lastError ?? "—"}</Td>
                  <Td>{canManage && (j.status === "FAILED" || j.status === "DEAD") && <RowAction action={retryJobAction} id={j.id} label="Retry" />}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pagination basePath="/admin/communications/jobs" params={{ status }} page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}
