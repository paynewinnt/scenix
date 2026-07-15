import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initDatabase } from '../../server/src/db';
import { applyMigrations } from '../../server/src/db/migrations';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('db-migrations', () => {
  it('creates the latest schema and records applied migrations on a fresh database', () => {
    const { db } = createDatabase();

    const columns = getColumnNames(db, 'test_runs');
    expect(columns).toContain('queued_at');
    expect(columns).toContain('dispatched_at');
    expect(getColumnNames(db, 'test_run_items')).toContain('steps_snapshot');

    const migrationIds = (
      db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as Array<{ id: string }>
    ).map((row) => row.id);

    expect(migrationIds).toEqual([
      '001_initial_schema',
      '002_test_runs_suite_columns',
      '003_run_tables_support_queued',
      '004_run_queue_timestamps',
      '005_run_history_uses_case_snapshots',
      '006_run_item_steps_snapshot',
    ]);

    expect(getTableSql(db, 'test_runs')).not.toContain('REFERENCES test_cases');
    expect(getTableSql(db, 'test_run_items')).not.toContain('REFERENCES test_cases');

    db.close();
  });

  it('upgrades a legacy run schema and backfills queue lifecycle timestamps', () => {
    const { dbPath } = createDatabase();

    const legacyDb = initDatabase(dbPath);
    legacyDb.exec(`
      DROP TABLE IF EXISTS schema_migrations;
      DROP TABLE IF EXISTS test_run_items;
      DROP TABLE IF EXISTS test_runs;
      DROP TABLE IF EXISTS test_suite_cases;
      DROP TABLE IF EXISTS test_suites;
      DROP TABLE IF EXISTS test_cases;

      CREATE TABLE test_cases (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        platform   TEXT NOT NULL CHECK (platform IN ('web','android','ios')),
        steps      TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE test_runs (
        id             TEXT PRIMARY KEY,
        test_case_id   TEXT NOT NULL,
        test_case_name TEXT NOT NULL,
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

      CREATE TABLE test_run_items (
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
    `);

    legacyDb.prepare(
      `INSERT INTO test_cases (id, name, platform, steps, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'case-1',
      '登录用例',
      'web',
      '1. 打开首页',
      '2026-04-22T10:00:00.000Z',
      '2026-04-22T10:00:00.000Z',
    );

    legacyDb.prepare(
      `INSERT INTO test_runs (
        id, test_case_id, test_case_name, platform, device_id, status, started_at, finished_at, report_path, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'run-1',
      'case-1',
      '登录用例',
      'web',
      null,
      'passed',
      '2026-04-22T10:05:00.000Z',
      '2026-04-22T10:10:00.000Z',
      null,
      null,
    );

    legacyDb.prepare(
      `INSERT INTO test_run_items (
        id, test_run_id, test_case_id, test_case_name, platform, status, started_at, finished_at, report_path, error_message, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'item-1',
      'run-1',
      'case-1',
      '登录用例',
      'web',
      'passed',
      '2026-04-22T10:05:00.000Z',
      '2026-04-22T10:10:00.000Z',
      null,
      null,
      0,
    );
    legacyDb.close();

    const migratedDb = initDatabase(dbPath);
    applyMigrations(migratedDb);

    const runColumns = getColumnNames(migratedDb, 'test_runs');
    expect(runColumns).toContain('suite_id');
    expect(runColumns).toContain('suite_name');
    expect(runColumns).toContain('queued_at');
    expect(runColumns).toContain('dispatched_at');
    expect(getColumnNames(migratedDb, 'test_run_items')).toContain('steps_snapshot');

    const row = migratedDb
      .prepare('SELECT queued_at, dispatched_at FROM test_runs WHERE id = ?')
      .get('run-1') as { queued_at: string; dispatched_at: string };

    expect(row.queued_at).toBe('2026-04-22T10:05:00.000Z');
    expect(row.dispatched_at).toBe('2026-04-22T10:05:00.000Z');
    const item = migratedDb
      .prepare('SELECT steps_snapshot FROM test_run_items WHERE id = ?')
      .get('item-1') as { steps_snapshot: string };
    expect(item.steps_snapshot).toBe('1. 打开首页');
    expect(getTableSql(migratedDb, 'test_runs')).not.toContain('REFERENCES test_cases');
    expect(getTableSql(migratedDb, 'test_run_items')).not.toContain('REFERENCES test_cases');

    const migrationCount = (
      migratedDb.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as { count: number }
    ).count;
    expect(migrationCount).toBe(6);

    migratedDb.close();
  });
});

function createDatabase(): { dbPath: string; db: ReturnType<typeof initDatabase> } {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'scenix-db-migrations-'));
  tempDirs.push(tempDir);
  const dbPath = path.join(tempDir, 'app.db');

  return {
    dbPath,
    db: initDatabase(dbPath),
  };
}

function getColumnNames(db: ReturnType<typeof initDatabase>, table: string): string[] {
  return (
    db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).map((column) => column.name);
}

function getTableSql(db: ReturnType<typeof initDatabase>, table: string): string {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { sql?: string } | undefined;

  return row?.sql ?? '';
}
