import { useEffect, useState } from 'react';

export function usePersistent<T>(key: string, initial: T, isValid: (value: unknown) => value is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      return isValid(parsed) ? parsed : initial;
    } catch { return initial; }
  });
  const [error, setError] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); setError(false); }
    catch { setError(true); }
  }, [key, value]);
  return [value, setValue, error] as const;
}

export const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
