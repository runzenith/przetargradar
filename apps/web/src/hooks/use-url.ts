import { useEffect, useState } from 'react';
export function useUrl() {
  const [search, setSearch] = useState(window.location.search);
  useEffect(() => {
    const listener = () => setSearch(window.location.search);
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  }, []);
  return {
    params: new URLSearchParams(search),
    update: (changes: Record<string, string | null>, replace = false) => {
      const next = new URLSearchParams(window.location.search);
      Object.entries(changes).forEach(([k, v]) => {
        if (v === null || v === '' || v === 'all') next.delete(k);
        else next.set(k, v);
      });
      const url = window.location.pathname + (next.size ? '?' + next.toString() : '');
      window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
      setSearch(window.location.search);
    },
  };
}
