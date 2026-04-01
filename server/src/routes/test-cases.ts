import { Router } from 'express';
import crypto from 'node:crypto';
import { getDb, toCamelCase, rowsToCamelCase } from '../db/index.js';

export interface TestCase {
  id: string;
  name: string;
  platform: 'web' | 'android' | 'ios';
  steps: string;
  createdAt: string;
  updatedAt: string;
}

export const testCasesRouter: Router = Router();

testCasesRouter.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM test_cases ORDER BY created_at DESC').all();
  res.json(rowsToCamelCase(rows as Record<string, unknown>[]));
});

testCasesRouter.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(toCamelCase(row as Record<string, unknown>));
});

testCasesRouter.post('/', (req, res) => {
  const db = getDb();
  const { name, platform, steps } = req.body;

  if (!name || !platform || !steps) {
    return res.status(400).json({ error: 'Missing required fields: name, platform, steps' });
  }
  if (!['web', 'android', 'ios'].includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform. Must be web, android, or ios' });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO test_cases (id, name, platform, steps, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, name, platform, steps, now, now);

  const row = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(id);
  res.status(201).json(toCamelCase(row as Record<string, unknown>));
});

testCasesRouter.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, platform, steps } = req.body;
  if (platform !== undefined && !['web', 'android', 'ios'].includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform. Must be web, android, or ios' });
  }
  if (name === undefined && platform === undefined && steps === undefined) {
    return res.status(400).json({ error: 'No fields provided for update' });
  }
  const now = new Date().toISOString();

  const sets: string[] = [];
  const params: unknown[] = [];

  if (name !== undefined) {
    sets.push('name = ?');
    params.push(name);
  }
  if (platform !== undefined) {
    sets.push('platform = ?');
    params.push(platform);
  }
  if (steps !== undefined) {
    sets.push('steps = ?');
    params.push(steps);
  }

  sets.push('updated_at = ?');
  params.push(now);
  params.push(req.params.id);

  db.prepare(`UPDATE test_cases SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const row = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(req.params.id);
  res.json(toCamelCase(row as Record<string, unknown>));
});

testCasesRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM test_cases WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});
