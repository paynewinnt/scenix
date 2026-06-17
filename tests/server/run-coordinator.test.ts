import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyRuntimeDeviceStatus,
  observeQueuedRuns,
  reserveRunResources,
  resetRunCoordinator,
  selectQueuedRunsForDispatch,
} from '../../server/src/services/run-coordinator';

describe('run-coordinator', () => {
  beforeEach(() => {
    resetRunCoordinator();
  });

  it('marks reserved devices as busy', () => {
    const reservation = reserveRunResources(
      {
        platform: 'android',
        deviceId: 'android-emulator-1',
      },
      'run-1',
    );
    expect(reservation).not.toBeNull();

    const devices = applyRuntimeDeviceStatus([
      {
        id: 'android-emulator-1',
        name: 'Pixel',
        platform: 'android' as const,
        udid: 'emulator-5554',
        status: 'connected' as const,
      },
    ]);

    expect(devices[0]?.status).toBe('busy');
    reservation?.release();
  });

  it('prevents double reservation for the same mobile device', () => {
    const first = reserveRunResources(
      {
        platform: 'ios',
        deviceId: 'ios-demo-1',
      },
      'run-1',
    );
    const second = reserveRunResources(
      {
        platform: 'ios',
        deviceId: 'ios-demo-1',
      },
      'run-2',
    );

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('prevents double reservation for the global web slot', () => {
    const first = reserveRunResources({ platform: 'web' }, 'run-1');
    const second = reserveRunResources({ platform: 'web' }, 'run-2');

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('starts the earliest runnable job per resource without blocking unrelated work', () => {
    const selected = selectQueuedRunsForDispatch(
      [
        {
          id: 'queued-web-2',
          platform: 'web',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
        {
          id: 'queued-android-b',
          platform: 'android',
          deviceId: 'android-b',
          startedAt: '2026-04-22T10:01:00.000Z',
        },
        {
          id: 'queued-android-a-2',
          platform: 'android',
          deviceId: 'android-a',
          startedAt: '2026-04-22T10:02:00.000Z',
        },
      ],
      [
        {
          id: 'running-web-1',
          platform: 'web',
          startedAt: '2026-04-22T09:59:00.000Z',
        },
        {
          id: 'running-android-a-1',
          platform: 'android',
          deviceId: 'android-a',
          startedAt: '2026-04-22T09:58:00.000Z',
        },
      ],
    );

    expect(selected.map((item) => item.id)).toEqual(['queued-android-b']);
  });

  it('keeps FIFO fairness within the same resource while allowing cross-resource concurrency', () => {
    const selected = selectQueuedRunsForDispatch(
      [
        {
          id: 'queued-android-a-1',
          platform: 'android',
          deviceId: 'android-a',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
        {
          id: 'queued-web-1',
          platform: 'web',
          startedAt: '2026-04-22T10:01:00.000Z',
        },
        {
          id: 'queued-android-a-2',
          platform: 'android',
          deviceId: 'android-a',
          startedAt: '2026-04-22T10:02:00.000Z',
        },
        {
          id: 'queued-android-b-1',
          platform: 'android',
          deviceId: 'android-b',
          startedAt: '2026-04-22T10:03:00.000Z',
        },
      ],
      [],
    );

    expect(selected.map((item) => item.id)).toEqual([
      'queued-android-a-1',
      'queued-web-1',
      'queued-android-b-1',
    ]);
  });

  it('describes queue position and blocking reason per resource', () => {
    const observations = observeQueuedRuns(
      [
        {
          id: 'queued-web-1',
          platform: 'web',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
        {
          id: 'queued-web-2',
          platform: 'web',
          startedAt: '2026-04-22T10:01:00.000Z',
        },
        {
          id: 'queued-android-1',
          platform: 'android',
          deviceId: 'android-a',
          startedAt: '2026-04-22T10:02:00.000Z',
        },
      ],
      [
        {
          id: 'running-web',
          platform: 'web',
          startedAt: '2026-04-22T09:59:00.000Z',
        },
      ],
    );

    expect(observations.get('queued-web-1')).toEqual({
      queuePosition: 1,
      blockedReason: 'waiting_web_slot',
    });
    expect(observations.get('queued-web-2')).toEqual({
      queuePosition: 2,
      blockedReason: 'waiting_same_resource_queue',
    });
    expect(observations.get('queued-android-1')).toEqual({
      queuePosition: 1,
      blockedReason: 'awaiting_dispatch',
    });
  });

  it('marks disconnected mobile runs explicitly', () => {
    const observations = observeQueuedRuns(
      [
        {
          id: 'queued-ios-1',
          platform: 'ios',
          deviceId: 'ios-demo-1',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      ],
      [],
      {
        disconnectedDeviceIds: ['ios-demo-1'],
      },
    );

    expect(observations.get('queued-ios-1')).toEqual({
      queuePosition: 1,
      blockedReason: 'device_disconnected',
    });
  });
});
