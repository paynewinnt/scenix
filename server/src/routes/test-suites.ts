import { Router } from 'express';
import crypto from 'node:crypto';
import { getDb, toCamelCase, rowsToCamelCase } from '../db/index.js';

export const testSuitesRouter: Router = Router();

testSuitesRouter.get('/', (_req, res) => {
  const db = getDb();
  const suites = db
    .prepare(
      `SELECT s.*, c.id AS case_id, c.name AS case_name, c.platform AS case_platform, c.steps AS case_steps
       FROM test_suites s
       LEFT JOIN test_suite_cases sc ON sc.suite_id = s.id
       LEFT JOIN test_cases c ON c.id = sc.test_case_id
       ORDER BY s.created_at DESC, sc.sort_order ASC, c.created_at ASC`,
    )
    .all() as Record<string, unknown>[];

  res.json(groupSuites(suites));
});

testSuitesRouter.get('/:id', (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.*, c.id AS case_id, c.name AS case_name, c.platform AS case_platform, c.steps AS case_steps
       FROM test_suites s
       LEFT JOIN test_suite_cases sc ON sc.suite_id = s.id
       LEFT JOIN test_cases c ON c.id = sc.test_case_id
       WHERE s.id = ?
       ORDER BY sc.sort_order ASC, c.created_at ASC`,
    )
    .all(req.params.id) as Record<string, unknown>[];

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(groupSuites(rows)[0]);
});

testSuitesRouter.post('/', (req, res) => {
  const db = getDb();
  const { name, testCaseIds } = req.body as {
    name?: string;
    testCaseIds?: string[];
  };

  const validation = validateSuitePayload(name, testCaseIds);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const cases = loadCasesByIds(validation.testCaseIds);
  if (cases.length !== validation.testCaseIds.length) {
    return res.status(400).json({ error: '部分测试用例不存在' });
  }

  const platform = ensureSinglePlatform(cases);
  if (!platform) {
    return res.status(400).json({ error: '同一个测试套件中的测试用例必须属于同一平台' });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO test_suites (id, name, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, validation.name, platform, now, now);

  insertSuiteCases(id, validation.testCaseIds);
  res.status(201).json(getSuiteById(id));
});

testSuitesRouter.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM test_suites WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }

  const { name, testCaseIds } = req.body as {
    name?: string;
    testCaseIds?: string[];
  };

  const hasName = typeof name === 'string';
  const hasTestCaseIds = Array.isArray(testCaseIds);
  if (!hasName && !hasTestCaseIds) {
    return res.status(400).json({ error: 'No fields provided for update' });
  }

  const nextName = hasName ? name.trim() : String((existing as Record<string, unknown>).name);
  let nextCaseIds: string[];
  if (hasTestCaseIds) {
    const validation = validateSuitePayload(nextName, testCaseIds);
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }
    nextCaseIds = validation.testCaseIds;
  } else {
    nextCaseIds = getExistingSuiteCaseIds(req.params.id);
  }

  const cases = loadCasesByIds(nextCaseIds);
  if (cases.length !== nextCaseIds.length) {
    return res.status(400).json({ error: '部分测试用例不存在' });
  }

  const platform = ensureSinglePlatform(cases);
  if (!platform) {
    return res.status(400).json({ error: '同一个测试套件中的测试用例必须属于同一平台' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE test_suites SET name = ?, platform = ?, updated_at = ? WHERE id = ?').run(
    nextName,
    platform,
    now,
    req.params.id,
  );
  db.prepare('DELETE FROM test_suite_cases WHERE suite_id = ?').run(req.params.id);
  insertSuiteCases(req.params.id, nextCaseIds);

  res.json(getSuiteById(req.params.id));
});

testSuitesRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM test_suites WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(204).send();
});

function validateSuitePayload(name?: string, testCaseIds?: string[]): {
  name: string;
  testCaseIds: string[];
  error?: string;
} {
  const trimmedName = name?.trim() ?? '';
  const uniqueCaseIds = Array.from(new Set((testCaseIds ?? []).filter(Boolean)));

  if (!trimmedName) {
    return { name: '', testCaseIds: [], error: '请输入测试套件名称' };
  }

  if (uniqueCaseIds.length === 0) {
    return { name: trimmedName, testCaseIds: [], error: '测试套件至少需要包含一个测试用例' };
  }

  return { name: trimmedName, testCaseIds: uniqueCaseIds };
}

function loadCasesByIds(ids: string[]): Array<Record<string, unknown>> {
  if (ids.length === 0) {
    return [];
  }

  const db = getDb();
  const placeholders = ids.map(() => '?').join(', ');
  return db
    .prepare(`SELECT * FROM test_cases WHERE id IN (${placeholders})`)
    .all(...ids) as Record<string, unknown>[];
}

function ensureSinglePlatform(cases: Array<Record<string, unknown>>): 'web' | 'android' | 'ios' | null {
  const platforms = new Set(cases.map((item) => item.platform));
  if (platforms.size !== 1) {
    return null;
  }
  return cases[0].platform as 'web' | 'android' | 'ios';
}

function insertSuiteCases(suiteId: string, testCaseIds: string[]): void {
  const db = getDb();
  const statement = db.prepare(
    'INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order) VALUES (?, ?, ?)',
  );
  testCaseIds.forEach((testCaseId, index) => {
    statement.run(suiteId, testCaseId, index);
  });
}

function getExistingSuiteCaseIds(suiteId: string): string[] {
  const db = getDb();
  return (
    db
      .prepare('SELECT test_case_id FROM test_suite_cases WHERE suite_id = ? ORDER BY sort_order ASC')
      .all(suiteId) as Array<{ test_case_id: string }>
  ).map((item) => item.test_case_id);
}

function getSuiteById(id: string): Record<string, unknown> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.*, c.id AS case_id, c.name AS case_name, c.platform AS case_platform, c.steps AS case_steps
       FROM test_suites s
       LEFT JOIN test_suite_cases sc ON sc.suite_id = s.id
       LEFT JOIN test_cases c ON c.id = sc.test_case_id
       WHERE s.id = ?
       ORDER BY sc.sort_order ASC, c.created_at ASC`,
    )
    .all(id) as Record<string, unknown>[];

  return groupSuites(rows)[0];
}

function groupSuites(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const suites = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const suiteId = String(row.id);
    let suite = suites.get(suiteId);
    if (!suite) {
      suite = {
        ...toCamelCase({
          id: row.id,
          name: row.name,
          platform: row.platform,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }),
        testCases: [],
        testCaseIds: [],
      };
      suites.set(suiteId, suite);
    }

    if (row.case_id) {
      const testCase = toCamelCase({
        id: row.case_id,
        name: row.case_name,
        platform: row.case_platform,
        steps: row.case_steps,
      });
      (suite.testCases as Record<string, unknown>[]).push(testCase);
      (suite.testCaseIds as string[]).push(String(row.case_id));
    }
  }

  return rowsToCamelCase(
    Array.from(suites.values()) as Record<string, unknown>[],
  );
}
