import { createContext, useContext, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useEventSource } from '@/hooks/use-event-source';

type SseEventType =
  | 'conversation:new'
  | 'conversation:message'
  | 'conversation:updated'
  | 'job:updated'
  | 'integration:health'
  | 'skill:updated'
  | 'usage:updated';

type Listener = (data: unknown) => void;

interface RealtimeContextValue {
  connected: boolean;
  subscribe: (event: SseEventType, listener: Listener) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  connected: false,
  subscribe: () => () => {},
});

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef(new Map<SseEventType, Set<Listener>>());

  const dispatch = useCallback((event: SseEventType) => {
    return (data: unknown) => {
      const set = listenersRef.current.get(event);
      if (set) {
        for (const fn of set) {
          try { fn(data); } catch { /* ignore */ }
        }
      }
    };
  }, []);

  const events = useMemo(() => ({
    'conversation:new': dispatch('conversation:new'),
    'conversation:message': dispatch('conversation:message'),
    'conversation:updated': dispatch('conversation:updated'),
    'job:updated': dispatch('job:updated'),
    'integration:health': dispatch('integration:health'),
    'skill:updated': dispatch('skill:updated'),
    'usage:updated': dispatch('usage:updated'),
  }), [dispatch]);

  const { connected } = useEventSource({ events, enabled: true });

  const subscribe = useCallback((event: SseEventType, listener: Listener) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(listener);

    return () => {
      listenersRef.current.get(event)?.delete(listener);
    };
  }, []);

  const value = useMemo(() => ({ connected, subscribe }), [connected, subscribe]);

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

/** Subscribe to a real-time SSE event. Returns { connected }. */
export function useRealtime() {
  return useContext(RealtimeContext);
}
