import { describe, expect, it } from 'vitest';
import { isTerminalRunStatus, mergeRunStatus } from '../../server/src/services/run-status';

describe('run-status', () => {
  it('keeps the higher-severity status', () => {
    expect(mergeRunStatus('passed', 'failed')).toBe('failed');
    expect(mergeRunStatus('failed', 'error')).toBe('error');
    expect(mergeRunStatus('error', 'failed')).toBe('error');
    expect(mergeRunStatus('queued', 'running')).toBe('running');
  });

  it('recognizes terminal statuses', () => {
    expect(isTerminalRunStatus('passed')).toBe(true);
    expect(isTerminalRunStatus('failed')).toBe(true);
    expect(isTerminalRunStatus('error')).toBe(true);
    expect(isTerminalRunStatus('queued')).toBe(false);
    expect(isTerminalRunStatus('pending')).toBe(false);
    expect(isTerminalRunStatus('running')).toBe(false);
  });
});
