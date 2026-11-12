import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  Menu,
  Radar,
  X,
  UserRound,
  Building2,
  Activity,
  LogOut,
} from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
export function WorkspaceHeader({
  view,
  source,
  user,
  onNavigate,
  onLogout,
}: {
  view: string;
  source: string | null;
  user: {
    email: string;
  } | null;
  onNavigate: (changes: Record<string, string | null>) => void;
  onLogout: () => Promise<void>;
}) {
  const [mobile, setMobile] = useState(false),
    [account, setAccount] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setAccount(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const navigate = (changes: Record<string, string | null>) => {
    onNavigate({ ...changes, page: null, tender: null });
    setMobile(false);
    setAccount(false);
  };
  useEffect(() => {
    if (!mobile && !account) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobile(false);
        setAccount(false);
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [mobile, account]);
  const links: {
    label: string;
    a11y?: string;
    active: boolean;
    patch: Record<string, string | null>;
  }[] = [
    {
      label: 'Przetargi',
      a11y: 'Wszystkie zamówienia',
      active: view === 'tenders' && source !== 'bk',
      patch: { view: null, source: null, city: null, cityRegion: null, mapPage: null },
    },
    {
      label: 'Baza Konkurencyjności',
      active: view === 'tenders' && source === 'bk',
      patch: { view: null, source: 'bk' },
    },
    {
      label: 'Mapa',
      a11y: 'Mapa zamówień',
      active: view === 'map',
      patch: { view: 'map', city: null },
    },
    { label: 'Dla Ciebie', active: view === 'recommended', patch: { view: 'recommended' } },
    { label: 'Zapisane', active: view === 'saved', patch: { view: 'saved' } },
  ];
  return (
    <header className="workspace-header">
      <div className="workspace-header-inner">
        <a className="wordmark" href="/" aria-label="PrzetargRadar — strona główna">
          <span className="wordmark-icon">
            <Radar size={22} strokeWidth={1.7} />
          </span>
          przetarg<span>radar</span>
          <i />
        </a>
        <nav
          className={'workspace-navigation ' + (mobile ? 'is-open' : '')}
          aria-label="Główna nawigacja"
          id="workspace-navigation"
        >
          {links.map((link) => (
            <button
              key={link.label}
              aria-label={link.a11y ?? link.label}
              aria-current={link.active ? 'page' : undefined}
              onClick={() => navigate(link.patch)}
            >
              {link.label}
            </button>
          ))}
          <div className="mobile-account-links">
            <button onClick={() => navigate({ view: 'profile' })}>Profil firmy</button>
            <button onClick={() => navigate({ view: 'system' })}>Status systemu</button>
          </div>
        </nav>
        <div className="workspace-actions">
          <ThemeToggle />
          {user ? (
            <div className="account-control" ref={accountRef}>
              <button
                className="account-trigger"
                aria-expanded={account}
                aria-controls="account-options"
                onClick={() => setAccount(!account)}
              >
                <UserRound size={17} />
                <span>Moje konto</span>
                <ChevronDown size={13} />
              </button>
              {account && (
                <div className="account-options" id="account-options">
                  <span className="account-email">{user.email}</span>
                  <button onClick={() => navigate({ view: 'profile' })}>
                    <Building2 size={15} />
                    Profil firmy
                  </button>
                  <button onClick={() => navigate({ view: 'system' })}>
                    <Activity size={15} />
                    Status systemu
                  </button>
                  <button onClick={() => void onLogout()}>
                    <LogOut size={15} />
                    Wyloguj się
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <button
                className="header-status-link"
                onClick={() => navigate({ view: 'system' })}
                aria-label="Status systemu"
              >
                <Activity size={17} />
              </button>
              <button className="header-signin" onClick={() => navigate({ view: 'auth' })}>
                Zaloguj się
                <ArrowUpRight size={14} />
              </button>
            </>
          )}
          <button
            className="header-mobile-toggle"
            aria-label={mobile ? 'Zamknij nawigację' : 'Otwórz nawigację'}
            aria-expanded={mobile}
            aria-controls="workspace-navigation"
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>
    </header>
  );
}
