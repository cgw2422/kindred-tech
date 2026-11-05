/**
 * Background worker. Run as a separate Railway service: `npm run worker`.
 * Schedules periodic jobs and processes the durable Postgres job queue.
 */
import { prisma } from "./lib/db";
import { runDueJobs, schedulePeriodicJobs } from "./lib/jobs/handlers";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 30_000);
const workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;
let stopping = false;

async function tick() {
  try {
    await schedulePeriodicJobs();
    let total = 0;
    // Drain in batches so a backlog clears quickly.
    for (let i = 0; i < 10; i++) {
      const r = await runDueJobs({ workerId, limit: 25 });
      total += r.processed;
      if (r.processed < 25) break;
    }
    if (total > 0) console.log(`[worker] processed ${total} job(s)`);
  } catch (err) {
    console.error("[worker] tick failed:", (err as Error).message);
  }
}

async function main() {
  console.log(`[worker] started (${workerId}), interval ${INTERVAL_MS}ms`);
  while (!stopping) {
    await tick();
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  await prisma.$disconnect();
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`[worker] ${sig} received, finishing current tick`);
    stopping = true;
  });
}

main();
