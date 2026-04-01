import { Router } from 'express';
import { addClient, removeClient } from '../sse/event-bus.js';

export const eventsRouter: Router = Router();

/**
 * SSE endpoint for real-time test run updates.
 * Clients connect via EventSource to receive live status changes.
 */
eventsRouter.get('/', (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'SSE connected' })}\n\n`);

  // Register this client
  const clientId = addClient(res);

  // Clean up on disconnect
  req.on('close', () => {
    removeClient(clientId);
  });
});
