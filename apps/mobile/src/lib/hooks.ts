import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api, errorMessage } from './api';

/** GET resource that refreshes when the screen regains focus (no background polling). */
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!path) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      try {
        setData(await api.get<T>(path));
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [path],
  );

  useEffect(() => {
    void load();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      void load('refresh');
    }, [load]),
  );

  return { data, setData, error, loading, refreshing, reload: () => load('refresh') };
}
