/**
 * Android Agent - Midscene.js Android SDK integration
 *
 * Uses @midscene/android to control Android devices via adb
 * with natural language instructions powered by VLM.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

export interface AndroidAgentOptions {
  udid?: string;
  aiActionContext?: string;
  autoDismissKeyboard?: boolean;
}

export async function createAndroidAgent(options: AndroidAgentOptions = {}) {
  ensureAndroidSdkEnv();
  const { AndroidAgent, AndroidDevice, getConnectedDevices } = await import('@midscene/android');

  const devices = await getConnectedDevices();
  if (devices.length === 0) {
    throw new Error('No Android devices connected. Please connect a device and enable USB debugging.');
  }

  const targetUdid = options.udid ?? devices[0].udid;
  const device = new AndroidDevice(targetUdid);

  const agent = new AndroidAgent(device, {
    aiActionContext:
      options.aiActionContext ??
      'If any location, permission, or user agreement dialog appears, tap agree/allow.',
  });

  return {
    agent,
    device,

    async aiAction(instruction: string): Promise<void> {
      await agent.aiAction(instruction);
    },

    async aiAssert(assertion: string): Promise<void> {
      await agent.aiAssert(assertion);
    },

    async aiQuery<T>(dataShape: string, instruction: string): Promise<T> {
      return agent.aiQuery(dataShape, { prompt: instruction });
    },

    async destroy(): Promise<void> {
      await agent.destroy();
    },
  };
}

function ensureAndroidSdkEnv(): void {
  if (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT) {
    return;
  }

  const sdkRoot = detectAndroidSdkRoot();
  if (!sdkRoot) {
    return;
  }

  process.env.ANDROID_HOME = sdkRoot;
  process.env.ANDROID_SDK_ROOT = sdkRoot;

  const platformToolsDir = path.join(sdkRoot, 'platform-tools');
  if (existsSync(platformToolsDir)) {
    const currentPath = process.env.PATH ?? '';
    const pathEntries = currentPath.split(path.delimiter).filter(Boolean);
    if (!pathEntries.includes(platformToolsDir)) {
      process.env.PATH = [platformToolsDir, ...pathEntries].join(path.delimiter);
    }
  }
}

function detectAndroidSdkRoot(): string | null {
  const fromAdbPath = sdkRootFromAdbPath(process.env.MIDSCENE_ADB_PATH);
  if (fromAdbPath) {
    return fromAdbPath;
  }

  const home = process.env.HOME ?? process.env.USERPROFILE;
  const candidates = [
    home ? path.join(home, 'Android', 'Sdk') : null,
    home ? path.join(home, 'Library', 'Android', 'sdk') : null,
    process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : null,
  ].filter((value): value is string => Boolean(value));

  return candidates.find((candidate) => existsSync(path.join(candidate, 'platform-tools', adbExecutableName()))) ?? null;
}

function sdkRootFromAdbPath(adbPath?: string): string | null {
  if (!adbPath) {
    return null;
  }

  const normalized = path.resolve(adbPath);
  const fileName = path.basename(normalized).toLowerCase();
  const expectedNames = new Set(['adb', 'adb.exe']);
  if (!expectedNames.has(fileName)) {
    return null;
  }

  const parentDir = path.dirname(normalized);
  if (path.basename(parentDir).toLowerCase() !== 'platform-tools') {
    return null;
  }

  const sdkRoot = path.dirname(parentDir);
  return existsSync(path.join(parentDir, adbExecutableName())) ? sdkRoot : null;
}

function adbExecutableName(): string {
  return process.platform === 'win32' ? 'adb.exe' : 'adb';
}
