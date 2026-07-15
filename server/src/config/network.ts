import { isIP } from 'node:net';

export interface ServerNetworkConfig {
  host: string;
  port: number;
  allowRemote: boolean;
  corsOrigins: Set<string>;
}

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function resolveServerNetworkConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerNetworkConfig {
  const host = env.SERVER_HOST?.trim() || '127.0.0.1';
  const port = parsePort(env.SERVER_PORT);
  const allowRemote = /^(?:1|true)$/i.test(env.SCENIX_ALLOW_REMOTE?.trim() ?? '');

  if (!isLoopbackHost(host) && !allowRemote) {
    throw new Error(
      `Refusing to listen on non-loopback host ${host}. ` +
        'Set SCENIX_ALLOW_REMOTE=true only when you understand that authentication is not enabled.',
    );
  }

  return {
    host,
    port,
    allowRemote,
    corsOrigins: getAllowedCorsOrigins(env),
  };
}

export function getAllowedCorsOrigins(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const configuredOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_CORS_ORIGINS);
}

function parsePort(value?: string): number {
  const port = value === undefined || value.trim() === '' ? 3001 : Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid SERVER_PORT: ${value}`);
  }
  return port;
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    (isIP(normalized) === 4 && normalized.startsWith('127.'))
  );
}
