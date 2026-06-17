import { recoverInterruptedRunRecords } from './run-repository.js';
import { broadcastRunUpdate } from './run-read-service.js';
import { scheduleQueuedRuns } from './run-execution-service.js';

export const STARTUP_RECOVERY_ERROR = '服务重启导致执行中断，未自动恢复';

export async function recoverInterruptedRunsOnStartup(): Promise<void> {
  const recoveredRunIds = recoverInterruptedRunRecords(
    STARTUP_RECOVERY_ERROR,
    new Date().toISOString(),
  );

  for (const runId of recoveredRunIds) {
    broadcastRunUpdate(runId);
  }

  await scheduleQueuedRuns();
}
