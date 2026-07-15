import Database from 'better-sqlite3';

interface Migration {
  id: string;
  description: string;
  apply(db: Database.Database): void;
}

const migrations: Migration[] = [
  {
    id: '001_initial_schema',
    description: 'Create base SQLite schema for cases, suites, and runs',
    apply(db) {
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
          suite_id     TEXT NOT NULL,
          test_case_id TEXT NOT NULL,
          sort_order   INTEGER NOT NULL DEFAULT 0,
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
          status         TEXT NOT NULL DEFAULT 'queued'
                           CHECK (status IN ('queued','pending','running','passed','failed','error')),
          queued_at      TEXT,
          dispatched_at  TEXT,
          started_at     TEXT NOT NULL,
          finished_at    TEXT,
          report_path    TEXT,
          error_message  TEXT
        );

        CREATE TABLE IF NOT EXISTS test_run_items (
          id             TEXT PRIMARY KEY,
          test_run_id    TEXT NOT NULL,
          test_case_id   TEXT NOT NULL,
          test_case_name TEXT NOT NULL,
          platform       TEXT NOT NULL CHECK (platform IN ('web','android','ios')),
          status         TEXT NOT NULL DEFAULT 'queued'
                           CHECK (status IN ('queued','pending','running','passed','failed','error')),
          started_at     TEXT NOT NULL,
          finished_at    TEXT,
          report_path    TEXT,
          error_message  TEXT,
          sort_order     INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_runs_case_id ON test_runs(test_case_id);
        CREATE INDEX IF NOT EXISTS idx_runs_status ON test_runs(status);
        CREATE INDEX IF NOT EXISTS idx_suite_cases_suite_id ON test_suite_cases(suite_id);
        CREATE INDEX IF NOT EXISTS idx_run_items_run_id ON test_run_items(test_run_id);
      `);
    },
  },
  {
    id: '002_test_runs_suite_columns',
    description: 'Ensure test_runs keeps suite metadata for suite-based execution',
    apply(db) {
      addColumnIfMissing(db, 'test_runs', 'suite_id', 'TEXT');
      addColumnIfMissing(db, 'test_runs', 'suite_name', 'TEXT');
    },
  },
  {
    id: '003_run_tables_support_queued',
    description: 'Expand run status enums to support queued lifecycle state',
    apply(db) {
      ensureRunTablesSupportQueued(db);
    },
  },
  {
    id: '004_run_queue_timestamps',
    description: 'Track queue and dispatch timestamps separately from started_at',
    apply(db) {
      addColumnIfMissing(db, 'test_runs', 'queued_at', 'TEXT');
      addColumnIfMissing(db, 'test_runs', 'dispatched_at', 'TEXT');

      db.prepare(
        `UPDATE test_runs
         SET queued_at = COALESCE(queued_at, started_at)
         WHERE queued_at IS NULL`,
      ).run();

      db.prepare(
        `UPDATE test_runs
         SET dispatched_at = COALESCE(dispatched_at, started_at)
         WHERE dispatched_at IS NULL AND status IN ('running', 'passed', 'failed', 'error')`,
      ).run();

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_runs_status_queued_at ON test_runs(status, queued_at);
        CREATE INDEX IF NOT EXISTS idx_runs_status_dispatched_at ON test_runs(status, dispatched_at);
      `);
    },
  },
  {
    id: '005_run_history_uses_case_snapshots',
    description: 'Keep historical run records when source test cases are edited or deleted',
    apply(db) {
      ensureRunHistoryUsesCaseSnapshots(db);
    },
  },
  {
    id: '006_run_item_steps_snapshot',
    description: 'Freeze test case steps when a queued run is created',
    apply(db) {
      addColumnIfMissing(db, 'test_run_items', 'steps_snapshot', 'TEXT');
      db.prepare(
        `UPDATE test_run_items
         SET steps_snapshot = (
           SELECT steps FROM test_cases WHERE test_cases.id = test_run_items.test_case_id
         )
         WHERE steps_snapshot IS NULL`,
      ).run();
    },
  },
];

export function applyMigrations(db: Database.Database): void {
  ensureMigrationTable(db);

  const applied = new Set(
    (
      db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as Array<{ id: string }>
    ).map((row) => row.id),
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }

    db.exec('BEGIN');
    try {
      migration.apply(db);
      db.prepare(
        'INSERT INTO schema_migrations (id, description, applied_at) VALUES (?, ?, ?)',
      ).run(migration.id, migration.description, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

function ensureMigrationTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at  TEXT NOT NULL
    );
  `);
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureRunTablesSupportQueued(db: Database.Database): void {
  const runTableSql = getTableSql(db, 'test_runs');
  const itemTableSql = getTableSql(db, 'test_run_items');

  if (runTableSql.includes("'queued'") && itemTableSql.includes("'queued'")) {
    return;
  }

  db.pragma('foreign_keys = OFF');

  try {
    db.exec(`
      ALTER TABLE test_run_items RENAME TO test_run_items_legacy;
      ALTER TABLE test_runs RENAME TO test_runs_legacy;

      CREATE TABLE test_runs (
        id             TEXT PRIMARY KEY,
        test_case_id   TEXT NOT NULL,
        test_case_name TEXT NOT NULL,
        suite_id       TEXT,
        suite_name     TEXT,
        platform       TEXT NOT NULL,
        device_id      TEXT,
        status         TEXT NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued','pending','running','passed','failed','error')),
        started_at     TEXT NOT NULL,
        finished_at    TEXT,
        report_path    TEXT,
        error_message  TEXT
      );

      CREATE TABLE test_run_items (
        id             TEXT PRIMARY KEY,
        test_run_id    TEXT NOT NULL,
        test_case_id   TEXT NOT NULL,
        test_case_name TEXT NOT NULL,
        platform       TEXT NOT NULL CHECK (platform IN ('web','android','ios')),
        status         TEXT NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued','pending','running','passed','failed','error')),
        started_at     TEXT NOT NULL,
        finished_at    TEXT,
        report_path    TEXT,
        error_message  TEXT,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE CASCADE
      );

      INSERT INTO test_runs (
        id, test_case_id, test_case_name, suite_id, suite_name, platform, device_id, status,
        started_at, finished_at, report_path, error_message
      )
      SELECT
        id, test_case_id, test_case_name, suite_id, suite_name, platform, device_id, status,
        started_at, finished_at, report_path, error_message
      FROM test_runs_legacy;

      INSERT INTO test_run_items (
        id, test_run_id, test_case_id, test_case_name, platform, status,
        started_at, finished_at, report_path, error_message, sort_order
      )
      SELECT
        id, test_run_id, test_case_id, test_case_name, platform, status,
        started_at, finished_at, report_path, error_message, sort_order
      FROM test_run_items_legacy;

      DROP TABLE test_run_items_legacy;
      DROP TABLE test_runs_legacy;
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_runs_case_id ON test_runs(test_case_id);
      CREATE INDEX IF NOT EXISTS idx_runs_status ON test_runs(status);
      CREATE INDEX IF NOT EXISTS idx_suite_cases_suite_id ON test_suite_cases(suite_id);
      CREATE INDEX IF NOT EXISTS idx_run_items_run_id ON test_run_items(test_run_id);
    `);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

function ensureRunHistoryUsesCaseSnapshots(db: Database.Database): void {
  const runTableSql = getTableSql(db, 'test_runs');
  const itemTableSql = getTableSql(db, 'test_run_items');

  if (!runTableSql.includes('REFERENCES test_cases') && !itemTableSql.includes('REFERENCES test_cases')) {
    return;
  }

  db.pragma('foreign_keys = OFF');

  try {
    db.exec(`
      ALTER TABLE test_run_items RENAME TO test_run_items_case_fk_legacy;
      ALTER TABLE test_runs RENAME TO test_runs_case_fk_legacy;

      CREATE TABLE test_runs (
        id             TEXT PRIMARY KEY,
        test_case_id   TEXT NOT NULL,
        test_case_name TEXT NOT NULL,
        suite_id       TEXT,
        suite_name     TEXT,
        platform       TEXT NOT NULL,
        device_id      TEXT,
        status         TEXT NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','pending','running','passed','failed','error')),
        queued_at      TEXT,
        dispatched_at  TEXT,
        started_at     TEXT NOT NULL,
        finished_at    TEXT,
        report_path    TEXT,
        error_message  TEXT
      );

      CREATE TABLE test_run_items (
        id             TEXT PRIMARY KEY,
        test_run_id    TEXT NOT NULL,
        test_case_id   TEXT NOT NULL,
        test_case_name TEXT NOT NULL,
        platform       TEXT NOT NULL CHECK (platform IN ('web','android','ios')),
        status         TEXT NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','pending','running','passed','failed','error')),
        started_at     TEXT NOT NULL,
        finished_at    TEXT,
        report_path    TEXT,
        error_message  TEXT,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE CASCADE
      );

      INSERT INTO test_runs (
        id, test_case_id, test_case_name, suite_id, suite_name, platform, device_id, status,
        queued_at, dispatched_at, started_at, finished_at, report_path, error_message
      )
      SELECT
        id, test_case_id, test_case_name, suite_id, suite_name, platform, device_id, status,
        queued_at, dispatched_at, started_at, finished_at, report_path, error_message
      FROM test_runs_case_fk_legacy;

      INSERT INTO test_run_items (
        id, test_run_id, test_case_id, test_case_name, platform, status,
        started_at, finished_at, report_path, error_message, sort_order
      )
      SELECT
        id, test_run_id, test_case_id, test_case_name, platform, status,
        started_at, finished_at, report_path, error_message, sort_order
      FROM test_run_items_case_fk_legacy;

      DROP TABLE test_run_items_case_fk_legacy;
      DROP TABLE test_runs_case_fk_legacy;
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_runs_case_id ON test_runs(test_case_id);
      CREATE INDEX IF NOT EXISTS idx_runs_status ON test_runs(status);
      CREATE INDEX IF NOT EXISTS idx_runs_status_queued_at ON test_runs(status, queued_at);
      CREATE INDEX IF NOT EXISTS idx_runs_status_dispatched_at ON test_runs(status, dispatched_at);
      CREATE INDEX IF NOT EXISTS idx_suite_cases_suite_id ON test_suite_cases(suite_id);
      CREATE INDEX IF NOT EXISTS idx_run_items_run_id ON test_run_items(test_run_id);
    `);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

function getTableSql(db: Database.Database, table: string): string {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { sql?: string } | undefined;

  return row?.sql ?? '';
}
