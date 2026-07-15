import { describe, expect, it } from 'vitest';
import { calculatePassRate } from '../../client/src/pages/dashboard-utils';

describe('calculatePassRate', () => {
  it('uses only terminal runs as the denominator', () => {
    expect(
      calculatePassRate([
        { status: 'passed' },
        { status: 'failed' },
        { status: 'error' },
        { status: 'queued' },
        { status: 'running' },
      ]),
    ).toBe('33.3');
  });

  it('returns zero when no run has finished', () => {
    expect(calculatePassRate([{ status: 'queued' }, { status: 'running' }])).toBe('0');
  });
});
