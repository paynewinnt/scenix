import { Router } from 'express';
import { getRuntimeReadinessReport } from 'core';

export const readinessRouter: Router = Router();

readinessRouter.get('/', async (_req, res) => {
  res.json(await getRuntimeReadinessReport());
});
