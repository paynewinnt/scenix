import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(configDir, '../.env') });

export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 60_000,
    setupFiles: ['./vitest.setup.ts'],
  },
});
