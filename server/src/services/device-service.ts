import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { applyRuntimeDeviceStatus } from './run-coordinator.js';

const execFileAsync = promisify(execFile);

export interface Device {
  id: string;
  name: string;
  platform: 'android' | 'ios';
  udid: string;
  status: 'connected' | 'disconnected' | 'busy';
  wdaHost?: string;
  wdaPort?: number;
}

let cachedDevices: Device[] = [];

type DeviceQueryOptions = {
  forceRefresh?: boolean;
  includeRuntimeStatus?: boolean;
};

function getIOSWdaPorts(): number[] {
  const raw = process.env.IOS_WDA_PORTS ?? process.env.IOS_WDA_PORT ?? '8100';
  const ports = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  return ports.length > 0 ? ports : [8100];
}

async function discoverAndroidDevices(): Promise<Device[]> {
  try {
    const adbPath = process.env.MIDSCENE_ADB_PATH ?? 'adb';
    const { stdout } = await execFileAsync(adbPath, ['devices', '-l']);
    const lines = stdout.trim().split('\n').slice(1);

    return lines
      .filter((line) => line.includes('device'))
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        const udid = parts[0];
        const modelMatch = line.match(/model:(\S+)/);

        return {
          id: `android-${udid}`,
          name: modelMatch ? modelMatch[1] : udid,
          platform: 'android' as const,
          udid,
          status: 'connected' as const,
        };
      });
  } catch {
    return [];
  }
}

async function discoverIOSDevices(): Promise<Device[]> {
  if (process.platform !== 'darwin') {
    return [];
  }

  try {
    const lines = (await discoverIOSDeviceLines()).filter(Boolean);
    const wdaHost = process.env.IOS_WDA_HOST ?? 'localhost';
    const wdaPorts = getIOSWdaPorts();

    return lines
      .map((line) => line.trim())
      .filter((line) => !line.includes('==') && !line.includes('Simulator') && /\([0-9A-F-]{8,}\)/i.test(line))
      .flatMap((line) => {
        const match = line.match(/^(.*)\s+\(([0-9A-F-]{8,})\)$/i);
        const name = match?.[1]?.trim() || `iOS Device (${line.slice(0, 8)})`;
        const udid = match?.[2]?.trim() || line;

        return wdaPorts.map((wdaPort) => ({
          id: `ios-${udid}-${wdaPort}`,
          name,
          platform: 'ios' as const,
          udid,
          status: 'connected' as const,
          wdaHost,
          wdaPort,
        }));
      });
  } catch {
    return [];
  }
}

async function discoverIOSDeviceLines(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('xcrun', ['xctrace', 'list', 'devices']);
    return stdout.trim().split('\n');
  } catch {
    try {
      const { stdout } = await execFileAsync('idevice_id', ['-l']);
      return stdout.trim().split('\n');
    } catch {
      return [];
    }
  }
}

export async function refreshDevices(options?: { includeRuntimeStatus?: boolean }): Promise<Device[]> {
  const [android, ios] = await Promise.all([discoverAndroidDevices(), discoverIOSDevices()]);
  cachedDevices = [...android, ...ios];
  return options?.includeRuntimeStatus === false ? cachedDevices : applyRuntimeDeviceStatus(cachedDevices);
}

export async function getDevices(options?: DeviceQueryOptions): Promise<Device[]> {
  if (options?.forceRefresh || cachedDevices.length === 0) {
    return refreshDevices({ includeRuntimeStatus: options?.includeRuntimeStatus });
  }

  return options?.includeRuntimeStatus === false ? cachedDevices : applyRuntimeDeviceStatus(cachedDevices);
}

export async function getDeviceById(id: string, options?: DeviceQueryOptions): Promise<Device | undefined> {
  const devices = await getDevices(options);
  return devices.find((device) => device.id === id);
}

export function peekCachedDevices(): Device[] {
  return [...cachedDevices];
}
