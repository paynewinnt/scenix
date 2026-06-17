export type RunStatus = 'queued' | 'pending' | 'running' | 'passed' | 'failed' | 'error';

const STATUS_PRIORITY: Record<RunStatus, number> = {
  queued: 0,
  pending: 1,
  running: 2,
  passed: 3,
  failed: 4,
  error: 5,
};

export function mergeRunStatus(current: RunStatus, next: RunStatus): RunStatus {
  return STATUS_PRIORITY[next] > STATUS_PRIORITY[current] ? next : current;
}

export function isTerminalRunStatus(status: RunStatus): boolean {
  return status === 'passed' || status === 'failed' || status === 'error';
}
