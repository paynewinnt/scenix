import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inspectCodexRuntime,
  resolveAndroidSdkEnvironment,
} from '../../core/src/config/runtime-readiness';

const tempDirs: string[] = [];
const ORIGINAL_ENV = {
  ANDROID_HOME: process.env.ANDROID_HOME,
  ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT,
  MIDSCENE_ADB_PATH: process.env.MIDSCENE_ADB_PATH,
};

afterEach(() => {
  restoreEnv();

  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('runtime-readiness', () => {
  it('checks the Codex CLI, app-server command, and login status', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({ stdout: 'codex-cli 0.143.0\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'Usage: codex app-server\n', stderr: '' })
      .mockResolvedValueOnce({
        stdout: '',
        stderr: 'WARNING: proceeding despite a PATH alias issue\nLogged in using ChatGPT\n',
      });

    const status = await inspectCodexRuntime(runCommand);

    expect(status).toEqual({
      ready: true,
      version: 'codex-cli 0.143.0',
      loginStatus: 'Logged in using ChatGPT',
    });
    expect(runCommand.mock.calls).toEqual([
      [['--version']],
      [['app-server', '--help']],
      [['login', 'status']],
    ]);
  });

  it('reports an unavailable Codex login as a readiness error', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({ stdout: 'codex-cli 0.143.0\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'Usage: codex app-server\n', stderr: '' })
      .mockRejectedValueOnce(new Error('Not logged in'));

    const status = await inspectCodexRuntime(runCommand);

    expect(status.ready).toBe(false);
    expect(status.version).toBe('codex-cli 0.143.0');
    expect(status.issue).toContain('Codex 尚未登录');
  });

  it('resolves Android SDK from MIDSCENE_ADB_PATH when it points to platform-tools', () => {
    const sdkRoot = createAndroidSdkFixture();
    process.env.MIDSCENE_ADB_PATH = path.join(sdkRoot, 'platform-tools', adbExecutableName());
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;

    const environment = resolveAndroidSdkEnvironment();

    expect(environment.sdkRoot).toBe(sdkRoot);
    expect(environment.source).toBe('adb-path');
    expect(environment.adbPath).toBe(path.join(sdkRoot, 'platform-tools', adbExecutableName()));
  });

  it('prefers explicit ANDROID_HOME over inferred paths', () => {
    const sdkRoot = createAndroidSdkFixture();
    process.env.ANDROID_HOME = sdkRoot;
    delete process.env.ANDROID_SDK_ROOT;
    delete process.env.MIDSCENE_ADB_PATH;

    const environment = resolveAndroidSdkEnvironment();

    expect(environment.sdkRoot).toBe(sdkRoot);
    expect(environment.source).toBe('env');
  });
});

function createAndroidSdkFixture(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scenix-android-sdk-'));
  const platformToolsDir = path.join(dir, 'platform-tools');
  mkdirSync(platformToolsDir, { recursive: true });
  writeFileSync(path.join(platformToolsDir, adbExecutableName()), '', 'utf8');
  tempDirs.push(dir);
  return dir;
}

function restoreEnv(): void {
  assignEnvValue('ANDROID_HOME', ORIGINAL_ENV.ANDROID_HOME);
  assignEnvValue('ANDROID_SDK_ROOT', ORIGINAL_ENV.ANDROID_SDK_ROOT);
  assignEnvValue('MIDSCENE_ADB_PATH', ORIGINAL_ENV.MIDSCENE_ADB_PATH);
}

function assignEnvValue(key: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function adbExecutableName(): string {
  return process.platform === 'win32' ? 'adb.exe' : 'adb';
}
