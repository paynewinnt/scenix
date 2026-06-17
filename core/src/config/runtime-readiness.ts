import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  DEFAULT_MIDSCENE_MODEL_NAME,
  getAIConfigDiagnostics,
} from './ai-config.js';

export type ReadinessStatus = 'ready' | 'warning' | 'error' | 'unsupported';

export interface ReadinessCheck {
  key: 'ai' | 'web' | 'android' | 'ios';
  label: string;
  status: ReadinessStatus;
  summary: string;
  details: string[];
}

export interface RuntimeReadinessReport {
  generatedAt: string;
  overallStatus: Exclude<ReadinessStatus, 'unsupported'>;
  checks: ReadinessCheck[];
}

export interface AndroidSdkEnvironment {
  sdkRoot: string | null;
  adbPath: string | null;
  source: 'env' | 'adb-path' | 'detected' | 'missing';
}

export async function getRuntimeReadinessReport(): Promise<RuntimeReadinessReport> {
  const aiCheck = getAIReadinessCheck();
  const [webCheck, androidCheck, iosCheck] = await Promise.all([
    getWebReadinessCheck(aiCheck.status !== 'error'),
    Promise.resolve(getAndroidReadinessCheck(aiCheck.status !== 'error')),
    getIOSReadinessCheck(aiCheck.status !== 'error'),
  ]);
  const checks = [aiCheck, webCheck, androidCheck, iosCheck];

  return {
    generatedAt: new Date().toISOString(),
    overallStatus: mergeReadinessStatuses(checks.map((check) => check.status)),
    checks,
  };
}

export function resolveAndroidSdkEnvironment(): AndroidSdkEnvironment {
  const configuredSdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (configuredSdkRoot) {
    const adbPath = path.join(configuredSdkRoot, 'platform-tools', adbExecutableName());
    return {
      sdkRoot: configuredSdkRoot,
      adbPath: existsSync(adbPath) ? adbPath : null,
      source: 'env',
    };
  }

  const fromAdbPath = sdkRootFromAdbPath(process.env.MIDSCENE_ADB_PATH);
  if (fromAdbPath) {
    return {
      sdkRoot: fromAdbPath,
      adbPath: path.join(fromAdbPath, 'platform-tools', adbExecutableName()),
      source: 'adb-path',
    };
  }

  const detectedSdkRoot = detectAndroidSdkRootFromKnownLocations();
  if (detectedSdkRoot) {
    return {
      sdkRoot: detectedSdkRoot,
      adbPath: path.join(detectedSdkRoot, 'platform-tools', adbExecutableName()),
      source: 'detected',
    };
  }

  return {
    sdkRoot: null,
    adbPath: process.env.MIDSCENE_ADB_PATH ? path.resolve(process.env.MIDSCENE_ADB_PATH) : null,
    source: 'missing',
  };
}

function getAIReadinessCheck(): ReadinessCheck {
  const diagnostics = getAIConfigDiagnostics();

  if (!diagnostics.ready) {
    return {
      key: 'ai',
      label: 'AI 模型配置',
      status: 'error',
      summary: 'AI 模型配置缺失或无效',
      details: [...diagnostics.issues, ...diagnostics.warnings],
    };
  }

  const config = diagnostics.config!;
  return {
    key: 'ai',
    label: 'AI 模型配置',
    status: diagnostics.warnings.length > 0 ? 'warning' : 'ready',
    summary: `模型配置可用：${config.modelName || DEFAULT_MIDSCENE_MODEL_NAME}`,
    details: [
      `Base URL: ${config.baseUrl}`,
      `Model: ${config.modelName || DEFAULT_MIDSCENE_MODEL_NAME}`,
      ...diagnostics.warnings,
    ],
  };
}

async function getWebReadinessCheck(aiReady: boolean): Promise<ReadinessCheck> {
  const customExecutablePath = process.env.MIDSCENE_CHROMIUM_EXECUTABLE_PATH;
  const channel = process.env.MIDSCENE_CHROMIUM_CHANNEL;

  if (customExecutablePath) {
    const resolvedPath = path.resolve(customExecutablePath);
    const executableExists = existsSync(resolvedPath);

    return {
      key: 'web',
      label: 'Web / Chromium',
      status: !executableExists ? 'error' : aiReady ? 'ready' : 'warning',
      summary: executableExists
        ? '已检测到自定义 Chromium 可执行文件'
        : '未找到 MIDSCENE_CHROMIUM_EXECUTABLE_PATH 指向的浏览器',
      details: [
        `Executable: ${resolvedPath}`,
        ...(channel ? [`Channel hint: ${channel}`] : []),
        ...(!aiReady ? ['仍需可用的 AI 模型配置才能执行 Web 测试。'] : []),
      ],
    };
  }

  try {
    const { chromium } = await import('playwright');
    const executablePath = chromium.executablePath();
    const executableExists = existsSync(executablePath);

    return {
      key: 'web',
      label: 'Web / Chromium',
      status: !executableExists ? 'error' : aiReady ? 'ready' : 'warning',
      summary: executableExists
        ? 'Playwright Chromium 浏览器已安装'
        : 'Playwright Chromium 浏览器未安装',
      details: [
        `Executable: ${executablePath}`,
        ...(channel ? [`Channel hint: ${channel}`] : []),
        '浏览器启动权限仍需在真实执行时验证。',
        ...(!aiReady ? ['仍需可用的 AI 模型配置才能执行 Web 测试。'] : []),
      ],
    };
  } catch (error) {
    return {
      key: 'web',
      label: 'Web / Chromium',
      status: 'error',
      summary: '无法加载 Playwright Chromium 运行时',
      details: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function getAndroidReadinessCheck(aiReady: boolean): ReadinessCheck {
  const sdkEnvironment = resolveAndroidSdkEnvironment();

  if (!sdkEnvironment.sdkRoot || !sdkEnvironment.adbPath || !existsSync(sdkEnvironment.adbPath)) {
    return {
      key: 'android',
      label: 'Android / SDK',
      status: 'error',
      summary: '未检测到可用的 Android SDK / adb',
      details: [
        '设置 ANDROID_HOME / ANDROID_SDK_ROOT，或提供标准 platform-tools 结构下的 MIDSCENE_ADB_PATH。',
        ...(sdkEnvironment.adbPath ? [`Current adb hint: ${sdkEnvironment.adbPath}`] : []),
      ],
    };
  }

  return {
    key: 'android',
    label: 'Android / SDK',
    status: aiReady ? 'ready' : 'warning',
    summary: 'Android SDK 与 adb 已就绪',
    details: [
      `SDK root: ${sdkEnvironment.sdkRoot}`,
      `adb: ${sdkEnvironment.adbPath}`,
      `Source: ${sdkEnvironment.source}`,
      ...(!aiReady ? ['仍需可用的 AI 模型配置才能执行 Android 测试。'] : []),
    ],
  };
}

async function getIOSReadinessCheck(aiReady: boolean): Promise<ReadinessCheck> {
  if (process.platform !== 'darwin') {
    return {
      key: 'ios',
      label: 'iOS / WDA',
      status: 'unsupported',
      summary: '当前系统不支持 iOS 执行',
      details: ['iOS 执行需要 macOS、Xcode 和 WebDriverAgent。'],
    };
  }

  const host = process.env.IOS_WDA_HOST ?? 'localhost';
  const ports = getIOSWdaPorts();
  const probes = await Promise.all(
    ports.map(async (port) => ({
      port,
      reachable: await canConnect(host, port),
    })),
  );
  const reachableProbe = probes.find((probe) => probe.reachable);

  return {
    key: 'ios',
    label: 'iOS / WDA',
    status: reachableProbe ? (aiReady ? 'ready' : 'warning') : 'warning',
    summary: reachableProbe
      ? `已检测到可访问的 WDA 端点 ${host}:${reachableProbe.port}`
      : '未检测到可访问的 WDA 端点',
    details: [
      `Configured host: ${host}`,
      `Configured ports: ${ports.join(', ')}`,
      ...probes.map((probe) =>
        probe.reachable ? `Reachable: ${host}:${probe.port}` : `Not reachable: ${host}:${probe.port}`,
      ),
      ...(!aiReady ? ['仍需可用的 AI 模型配置才能执行 iOS 测试。'] : []),
    ],
  };
}

function mergeReadinessStatuses(statuses: ReadinessStatus[]): Exclude<ReadinessStatus, 'unsupported'> {
  if (statuses.includes('error')) {
    return 'error';
  }

  if (statuses.includes('warning')) {
    return 'warning';
  }

  return 'ready';
}

function getIOSWdaPorts(): number[] {
  const raw = process.env.IOS_WDA_PORTS ?? process.env.IOS_WDA_PORT ?? '8100';
  const ports = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  return ports.length > 0 ? ports : [8100];
}

async function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 250 });

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function detectAndroidSdkRootFromKnownLocations(): string | null {
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
