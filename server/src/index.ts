import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testCasesRouter } from './routes/test-cases.js';
import { testRunsRouter } from './routes/test-runs.js';
import { devicesRouter } from './routes/devices.js';

dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.SERVER_PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.use('/api/test-cases', testCasesRouter);
app.use('/api/test-runs', testRunsRouter);
app.use('/api/devices', devicesRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
