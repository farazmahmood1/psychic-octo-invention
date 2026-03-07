import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiClientError } from '@/api/client';

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Simple data-fetching hook for GET endpoints.
 * Returns loading/error/data states and a refetch function.
 * Gracefully handles backend not-yet-implemented (404/501) as empty data.
 */
export function useApiQuery<T>(
  endpoint: string | null,
  defaultValue: T,
): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!endpoint) {
      setData(defaultValue);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    apiClient
      .get<T>(endpoint)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        // Treat not-implemented endpoints as "no data yet" rather than errors
        if (err instanceof ApiClientError && (err.status === 404 || err.status === 501)) {
          setData(defaultValue);
        } else if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('An unexpected error occurred');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint, tick, defaultValue]);

  return { data, loading, error, refetch };
}
