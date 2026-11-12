import { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
export function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.dataset.theme === 'dark'),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return (
    <button
      className="theme-toggle"
      aria-label={dark ? 'Włącz jasny motyw' : 'Włącz ciemny motyw'}
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.dataset.theme = next ? 'dark' : 'light';
        try {
          localStorage.setItem('radar-theme', next ? 'dark' : 'light');
        } catch {}
      }}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
      <span>{dark ? 'Jasny' : 'Ciemny'}</span>
    </button>
  );
}
