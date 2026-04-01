import { Router } from 'express';
import { getDevices, refreshDevices } from '../services/device-service.js';

export const devicesRouter: Router = Router();

devicesRouter.get('/', async (_req, res) => {
  res.json(await getDevices());
});

devicesRouter.post('/refresh', async (_req, res) => {
  const devices = await refreshDevices();
  res.json(devices);
});
