import { Router } from 'express';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface Device {
  id: string;
  name: string;
  platform: 'android' | 'ios';
  udid: string;
  status: 'connected' | 'disconnected' | 'busy';
}

let cachedDevices: Device[] = [];

async function discoverAndroidDevices(): Promise<Device[]> {
  try {
    const adbPath = process.env.MIDSCENE_ADB_PATH ?? 'adb';
    const { stdout } = await execAsync(`${adbPath} devices -l`);
    const lines = stdout.trim().split('\n').slice(1); // skip header
    return lines
      .filter((line) => line.includes('device'))
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        const udid = parts[0];
        const modelMatch = line.match(/model:(\S+)/);
        const name = modelMatch ? modelMatch[1] : udid;
        return {
          id: `android-${udid}`,
          name,
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
  try {
    const { stdout } = await execAsync('xcrun xctrace list devices 2>/dev/null || idevice_id -l 2>/dev/null');
    const lines = stdout.trim().split('\n').filter(Boolean);
    return lines.map((udid) => ({
      id: `ios-${udid.trim()}`,
      name: `iOS Device (${udid.trim().slice(0, 8)})`,
      platform: 'ios' as const,
      udid: udid.trim(),
      status: 'connected' as const,
    }));
  } catch {
    return [];
  }
}

async function refreshDevices(): Promise<Device[]> {
  const [android, ios] = await Promise.all([
    discoverAndroidDevices(),
    discoverIOSDevices(),
  ]);
  cachedDevices = [...android, ...ios];
  return cachedDevices;
}

export const devicesRouter = Router();

devicesRouter.get('/', (_req, res) => {
  res.json(cachedDevices);
});

devicesRouter.post('/refresh', async (_req, res) => {
  const devices = await refreshDevices();
  res.json(devices);
});
