import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { resolveFromWorkspaceRoot, resolveFromServerRoot } from '../config/paths.js';

let db: Database.Database;

/**
 * Initialize SQLite database with WAL mode and create tables if needed.
 */
export function initDatabase(dbPath?: string): Database.Database {
  const defaultPath = resolveFromServerRoot('data/app.db');
  const configuredPath = dbPath ?? process.env.DATABASE_PATH;
  const resolvedPath = configuredPath ? resolveFromWorkspaceRoot(configuredPath) : defaultPath;

  // Ensure the directory exists
  mkdirSync(path.dirname(resolvedPath), { recursive: true });

  db = new Database(resolvedPath);

  // Enable WAL mode for better concurrent read/write performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();

  console.log(`Database initialized at ${resolvedPath}`);
  return db;
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_cases (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      platform   TEXT NOT NULL CHECK (platform IN ('web','android','ios')),
      steps      TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS test_suites (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      platform   TEXT NOT NULL CHECK (platform IN ('web','android','ios')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS test_suite_cases (
      suite_id    TEXT NOT NULL,
      test_case_id TEXT NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (suite_id, test_case_id),
      FOREIGN KEY (suite_id) REFERENCES test_suites(id) ON DELETE CASCADE,
      FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS test_runs (
      id             TEXT PRIMARY KEY,
      test_case_id   TEXT NOT NULL,
      test_case_name TEXT NOT NULL,
      suite_id       TEXT,
      suite_name     TEXT,
      platform       TEXT NOT NULL,
      device_id      TEXT,
      status         TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','running','passed','failed','error')),
      started_at     TEXT NOT NULL,
      finished_at    TEXT,
      report_path    TEXT,
      error_message  TEXT,
      FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS test_run_items (
      id             TEXT PRIMARY KEY,
      test_run_id    TEXT NOT NULL,
      test_case_id   TEXT NOT NULL,
      test_case_name TEXT NOT NULL,
      platform       TEXT NOT NULL CHECK (platform IN ('web','android','ios')),
      status         TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','running','passed','failed','error')),
      started_at     TEXT NOT NULL,
      finished_at    TEXT,
      report_path    TEXT,
      error_message  TEXT,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_runs_case_id ON test_runs(test_case_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status  ON test_runs(status);
    CREATE INDEX IF NOT EXISTS idx_suite_cases_suite_id ON test_suite_cases(suite_id);
    CREATE INDEX IF NOT EXISTS idx_run_items_run_id ON test_run_items(test_run_id);
  `);

  ensureColumnExists('test_runs', 'suite_id', 'TEXT');
  ensureColumnExists('test_runs', 'suite_name', 'TEXT');
}

function ensureColumnExists(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Get the database instance. Must call initDatabase() first.
 */
export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Convert snake_case DB row keys to camelCase for API responses.
 */
export function toCamelCase<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

/**
 * Convert multiple rows from snake_case to camelCase.
 */
export function rowsToCamelCase<T extends Record<string, unknown>>(rows: T[]): Record<string, unknown>[] {
  return rows.map(toCamelCase);
}
