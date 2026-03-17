import { useEffect, useRef, useCallback, useState } from 'react';

type SseEventType =
  | 'conversation:new'
  | 'conversation:message'
  | 'conversation:updated'
  | 'job:updated'
  | 'integration:health'
  | 'skill:updated'
  | 'usage:updated';

type SseEventHandler = (data: unknown) => void;

interface UseEventSourceOptions {
  /** Map of event type → handler */
  events?: Partial<Record<SseEventType, SseEventHandler>>;
  /** Whether the connection is enabled (default true) */
  enabled?: boolean;
}

/**
 * React hook that connects to the SSE endpoint and dispatches events.
 * Auto-reconnects with exponential backoff on disconnection.
 */
export function useEventSource({ events, enabled = true }: UseEventSourceOptions = {}) {
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  const reconnectDelay = useRef(1000);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource('/api/v1/events/stream', { withCredentials: true });
    esRef.current = es;

    es.addEventListener('connected', () => {
      setConnected(true);
      reconnectDelay.current = 1000; // reset backoff on success
    });

    // Listen for all event types
    const eventTypes: SseEventType[] = [
      'conversation:new',
      'conversation:message',
      'conversation:updated',
      'job:updated',
      'integration:health',
      'skill:updated',
      'usage:updated',
    ];

    for (const eventType of eventTypes) {
      es.addEventListener(eventType, (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data);
          eventsRef.current?.[eventType]?.(data);
        } catch {
          // ignore malformed SSE data
        }
      });
    }

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;

      // Reconnect with exponential backoff (max 30s)
      const delay = Math.min(reconnectDelay.current, 30_000);
      reconnectDelay.current = delay * 2;
      setTimeout(() => {
        if (enabled) connect();
      }, delay);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
      return;
    }

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [enabled, connect]);

  return { connected };
}
