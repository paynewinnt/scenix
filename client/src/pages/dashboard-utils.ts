import type { TestRun } from '../services/api';

export function calculatePassRate(runs: Array<Pick<TestRun, 'status'>>): string {
  const terminalRuns = runs.filter((run) =>
    ['passed', 'failed', 'error'].includes(run.status),
  );
  if (terminalRuns.length === 0) {
    return '0';
  }

  const passedRuns = terminalRuns.filter((run) => run.status === 'passed').length;
  return ((passedRuns / terminalRuns.length) * 100).toFixed(1);
}
