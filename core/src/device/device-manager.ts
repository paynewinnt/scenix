/**
 * Device Manager - Discovers and manages connected Android/iOS devices
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface DeviceInfo {
  udid: string;
  name: string;
  platform: 'android' | 'ios';
  status: 'connected' | 'disconnected';
}

export class DeviceManager {
  private devices: DeviceInfo[] = [];

  async discoverAll(): Promise<DeviceInfo[]> {
    const [android, ios] = await Promise.all([
      this.discoverAndroid(),
      this.discoverIOS(),
    ]);
    this.devices = [...android, ...ios];
    return this.devices;
  }

  getDevices(): DeviceInfo[] {
    return this.devices;
  }

  getDevice(udid: string): DeviceInfo | undefined {
    return this.devices.find((d) => d.udid === udid);
  }

  private async discoverAndroid(): Promise<DeviceInfo[]> {
    try {
      const adbPath = process.env.MIDSCENE_ADB_PATH ?? 'adb';
      const { stdout } = await execAsync(`${adbPath} devices -l`);
      const lines = stdout.trim().split('\n').slice(1);
      return lines
        .filter((line) => line.includes('device'))
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          const udid = parts[0];
          const modelMatch = line.match(/model:(\S+)/);
          return {
            udid,
            name: modelMatch?.[1] ?? udid,
            platform: 'android' as const,
            status: 'connected' as const,
          };
        });
    } catch {
      return [];
    }
  }

  private async discoverIOS(): Promise<DeviceInfo[]> {
    try {
      const { stdout } = await execAsync(
        'xcrun xctrace list devices 2>/dev/null || idevice_id -l 2>/dev/null',
      );
      return stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((udid) => ({
          udid: udid.trim(),
          name: `iOS Device (${udid.trim().slice(0, 8)})`,
          platform: 'ios' as const,
          status: 'connected' as const,
        }));
    } catch {
      return [];
    }
  }
}
