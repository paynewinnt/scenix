import { Router } from 'express';
import crypto from 'node:crypto';

export interface TestCase {
  id: string;
  name: string;
  platform: 'web' | 'android' | 'ios';
  steps: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory store (replace with database in production)
const store: TestCase[] = [];

export const testCasesRouter = Router();

testCasesRouter.get('/', (_req, res) => {
  res.json(store);
});

testCasesRouter.get('/:id', (req, res) => {
  const item = store.find((c) => c.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

testCasesRouter.post('/', (req, res) => {
  const { name, platform, steps } = req.body;
  const now = new Date().toISOString();
  const item: TestCase = {
    id: crypto.randomUUID(),
    name,
    platform,
    steps,
    createdAt: now,
    updatedAt: now,
  };
  store.push(item);
  res.status(201).json(item);
});

testCasesRouter.put('/:id', (req, res) => {
  const idx = store.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { name, platform, steps } = req.body;
  const updated = {
    ...store[idx],
    ...(name && { name }),
    ...(platform && { platform }),
    ...(steps && { steps }),
    updatedAt: new Date().toISOString(),
  };
  store[idx] = updated;
  res.json(updated);
});

testCasesRouter.delete('/:id', (req, res) => {
  const idx = store.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  store.splice(idx, 1);
  res.status(204).send();
});
