import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { resolveFromWorkspaceRoot, resolveFromServerRoot } from '../config/paths.js';
import { applyMigrations } from './migrations.js';

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

  applyMigrations(db);

  console.log(`Database initialized at ${resolvedPath}`);
  return db;
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
