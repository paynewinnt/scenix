import type { Response } from 'express';

interface SSEClient {
  id: string;
  res: Response;
}

let clients: SSEClient[] = [];
let clientIdCounter = 0;

const HEARTBEAT_INTERVAL = 30_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Register a new SSE client connection.
 */
export function addClient(res: Response): string {
  const id = String(++clientIdCounter);
  clients.push({ id, res });

  // Start heartbeat if this is the first client
  if (clients.length === 1) {
    startHeartbeat();
  }

  return id;
}

/**
 * Remove a disconnected SSE client.
 */
export function removeClient(id: string): void {
  clients = clients.filter((c) => c.id !== id);

  // Stop heartbeat if no clients remain
  if (clients.length === 0) {
    stopHeartbeat();
  }
}

/**
 * Broadcast an event to all connected SSE clients.
 */
export function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of clients) {
    try {
      client.res.write(payload);
    } catch {
      // Client likely disconnected — will be cleaned up on 'close'
    }
  }
}

/**
 * Get the current number of connected clients.
 */
export function getClientCount(): number {
  return clients.length;
}

function startHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    const comment = `: heartbeat ${new Date().toISOString()}\n\n`;
    for (const client of clients) {
      try {
        client.res.write(comment);
      } catch {
        // ignore
      }
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
