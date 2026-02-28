import { useEffect, useRef } from 'react';

interface UseSSEOptions {
  /** Map of event names to handler callbacks */
  events: Record<string, (data: unknown) => void>;
  /** Whether to enable the SSE connection (default: true) */
  enabled?: boolean;
}

/**
 * React hook for subscribing to Server-Sent Events.
 * Automatically reconnects on connection loss.
 * On reconnect, fires an 'onReconnect' event if provided.
 */
export function useSSE({ events, enabled = true }: UseSSEOptions): void {
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    if (!enabled) return;

    const url = '/api/test-runs/events';
    let es: EventSource | null = null;
    let reconnectAttempt = 0;

    function connect() {
      es = new EventSource(url);

      es.addEventListener('connected', () => {
        // Reset reconnect counter on successful connection
        if (reconnectAttempt > 0) {
          // This is a reconnection — notify handler to refetch data
          eventsRef.current['reconnect']?.({});
        }
        reconnectAttempt = 0;
      });

      // Register event handlers
      for (const eventName of Object.keys(eventsRef.current)) {
        if (eventName === 'reconnect') continue;
        es.addEventListener(eventName, (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            eventsRef.current[eventName]?.(data);
          } catch {
            // Ignore parse errors
          }
        });
      }

      es.onerror = () => {
        es?.close();
        es = null;
        reconnectAttempt++;
        // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
        const delay = Math.min(1000 * 2 ** (reconnectAttempt - 1), 30_000);
        setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      es?.close();
      es = null;
    };
  }, [enabled]);
}
