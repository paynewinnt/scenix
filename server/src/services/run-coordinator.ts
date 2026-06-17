type RunPlatform = 'web' | 'android' | 'ios';

export type RunQueueBlockedReason =
  | 'awaiting_dispatch'
  | 'waiting_web_slot'
  | 'waiting_device_busy'
  | 'waiting_same_resource_queue'
  | 'device_disconnected';

export interface CoordinatedRun {
  id: string;
  platform: RunPlatform;
  deviceId?: string;
  startedAt: string;
}

export interface QueuedRunObservation {
  queuePosition: number;
  blockedReason: RunQueueBlockedReason;
}

type DeviceReservationRecord = {
  runId: string;
};

let webReservation: { runId: string } | null = null;
const deviceReservations = new Map<string, DeviceReservationRecord>();

export interface RunResourceReservation {
  runId: string;
  platform: RunPlatform;
  deviceId?: string;
  release(): void;
}

export function reserveRunResources(
  run: Pick<CoordinatedRun, 'platform' | 'deviceId'>,
  runId: string,
): RunResourceReservation | null {
  if (run.platform === 'web') {
    if (webReservation) {
      return null;
    }

    webReservation = { runId };
    return {
      runId,
      platform: run.platform,
      release() {
        if (webReservation?.runId === runId) {
          webReservation = null;
        }
      },
    };
  }

  if (!run.deviceId) {
    return null;
  }

  if (deviceReservations.has(run.deviceId)) {
    return null;
  }

  deviceReservations.set(run.deviceId, { runId });

  return {
    runId,
    platform: run.platform,
    deviceId: run.deviceId,
    release() {
      const current = deviceReservations.get(run.deviceId!);
      if (current?.runId === runId) {
        deviceReservations.delete(run.deviceId!);
      }
    },
  };
}

export function selectQueuedRunsForDispatch(
  queuedRuns: CoordinatedRun[],
  runningRuns: CoordinatedRun[],
): CoordinatedRun[] {
  const busyResources = new Set<string>(runningRuns.map(getRunResourceKey));
  const selected: CoordinatedRun[] = [];

  const orderedQueuedRuns = [...queuedRuns].sort((left, right) => {
    const leftTime = new Date(left.startedAt).getTime();
    const rightTime = new Date(right.startedAt).getTime();
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
  });

  for (const run of orderedQueuedRuns) {
    const resourceKey = getRunResourceKey(run);
    if (busyResources.has(resourceKey)) {
      continue;
    }

    busyResources.add(resourceKey);
    selected.push(run);
  }

  return selected;
}

export function applyRuntimeDeviceStatus<T extends { id: string; status: 'connected' | 'disconnected' | 'busy' }>(
  devices: T[],
): T[] {
  return devices.map((device) =>
    deviceReservations.has(device.id) && device.status === 'connected'
      ? { ...device, status: 'busy' as const }
      : device,
  );
}

export function resetRunCoordinator(): void {
  webReservation = null;
  deviceReservations.clear();
}

export function observeQueuedRuns(
  queuedRuns: CoordinatedRun[],
  runningRuns: CoordinatedRun[],
  options?: {
    disconnectedDeviceIds?: string[];
  },
): Map<string, QueuedRunObservation> {
  const busyResources = new Set<string>(runningRuns.map(getRunResourceKey));
  const disconnectedDeviceIds = new Set(options?.disconnectedDeviceIds ?? []);
  const resourceQueueCounts = new Map<string, number>();
  const observations = new Map<string, QueuedRunObservation>();

  const orderedQueuedRuns = [...queuedRuns].sort((left, right) => {
    const leftTime = new Date(left.startedAt).getTime();
    const rightTime = new Date(right.startedAt).getTime();
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
  });

  for (const run of orderedQueuedRuns) {
    const resourceKey = getRunResourceKey(run);
    const queuePosition = (resourceQueueCounts.get(resourceKey) ?? 0) + 1;
    resourceQueueCounts.set(resourceKey, queuePosition);

    let blockedReason: RunQueueBlockedReason = 'awaiting_dispatch';

    if (run.deviceId && disconnectedDeviceIds.has(run.deviceId)) {
      blockedReason = 'device_disconnected';
    } else if (queuePosition > 1) {
      blockedReason = 'waiting_same_resource_queue';
    } else if (busyResources.has(resourceKey)) {
      blockedReason = run.platform === 'web' ? 'waiting_web_slot' : 'waiting_device_busy';
    }

    observations.set(run.id, {
      queuePosition,
      blockedReason,
    });
  }

  return observations;
}

function getRunResourceKey(run: Pick<CoordinatedRun, 'platform' | 'deviceId'>): string {
  if (run.platform === 'web') {
    return 'web';
  }

  return `device:${run.deviceId ?? 'missing'}`;
}
