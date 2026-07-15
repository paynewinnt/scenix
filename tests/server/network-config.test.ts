import { describe, expect, it } from 'vitest';
import {
  getAllowedCorsOrigins,
  resolveServerNetworkConfig,
} from '../../server/src/config/network';

describe('server network configuration', () => {
  it('defaults to a loopback-only listener and local frontend origins', () => {
    const config = resolveServerNetworkConfig({});

    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 3001,
      allowRemote: false,
    });
    expect([...config.corsOrigins]).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });

  it('rejects remote listeners unless explicitly enabled', () => {
    expect(() => resolveServerNetworkConfig({ SERVER_HOST: '0.0.0.0' })).toThrow(
      /SCENIX_ALLOW_REMOTE=true/,
    );

    expect(
      resolveServerNetworkConfig({
        SERVER_HOST: '0.0.0.0',
        SERVER_PORT: '8080',
        SCENIX_ALLOW_REMOTE: 'true',
      }),
    ).toMatchObject({ host: '0.0.0.0', port: 8080, allowRemote: true });

    expect(() => resolveServerNetworkConfig({ SERVER_HOST: '127.999.1.1' })).toThrow(
      /SCENIX_ALLOW_REMOTE=true/,
    );
  });

  it('validates the port and parses an explicit CORS allowlist', () => {
    expect(() => resolveServerNetworkConfig({ SERVER_PORT: 'not-a-port' })).toThrow(
      /Invalid SERVER_PORT/,
    );
    expect([...getAllowedCorsOrigins({ CORS_ORIGINS: 'https://one.test, https://two.test' })]).toEqual([
      'https://one.test',
      'https://two.test',
    ]);
  });
});
