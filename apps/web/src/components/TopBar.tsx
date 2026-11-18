import { useState } from 'react';
import { LOCALES, type Locale, t } from '../i18n/messages.js';

interface TopBarProps {
  route: string;
  onNavigate: (route: string) => void;
  onHome: () => void;
  onOpenTrust: () => void;
  onOpenPalette: () => void;
  swReady: boolean;
  locale: Locale;
  onChangeLocale: (next: Locale) => void;
}

const NAV_ITEMS = [
  { label: 'Workbench', route: '#/workbench' },
  { label: 'Reader & Editor', route: '#/reader' },
  { label: 'Redact', route: '#/redact' },
  { label: 'Compare', route: '#/compare' },
  { label: 'Scanner', route: '#/scan' },
  { label: 'Recipes', route: '#/recipe' },
] as const;

export function TopBar({
  route,
  onNavigate,
  onHome,
  onOpenTrust,
  onOpenPalette,
  swReady,
  locale,
  onChangeLocale,
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="topbar">
      <div className="topbar-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <button type="button" className="brand" onClick={onHome}>
            <svg
              width="28"
              height="28"
              viewBox="0 0 28 28"
              fill="none"
              stroke="#6BFFB0"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M20.5 6.5A10 10 0 1 0 24 14" />
            </svg>
            Airgap
          </button>

          <nav className="topbar-nav topbar-nav-desktop" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.route}
                type="button"
                className="topbar-link"
                aria-current={route.startsWith(item.route) ? 'page' : undefined}
                onClick={() => onNavigate(item.route)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="btn2 topbar-compact-btn"
            onClick={onOpenPalette}
            aria-label="Search tools"
          >
            <span className="topbar-search-full">Search (Ctrl+K)</span>
            <span className="topbar-search-short">Search</span>
          </button>
          <select
            aria-label="Language"
            value={locale}
            onChange={(e) => onChangeLocale(e.target.value as Locale)}
            className="mono topbar-lang"
          >
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn2 topbar-compact-btn topbar-menu-btn"
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
          <button
            type="button"
            className="pill topbar-trust-desktop"
            data-testid="trust-pill"
            onClick={onOpenTrust}
            aria-label="Open Trust panel"
          >
            <span className="dot" aria-hidden="true" />
            {t(locale, 'trust.pill')}
            {swReady ? ` · ${t(locale, 'trust.offline')}` : ''}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="topbar-nav-mobile" aria-label="Mobile navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.route}
              type="button"
              className="topbar-link"
              aria-current={route.startsWith(item.route) ? 'page' : undefined}
              onClick={() => {
                setMenuOpen(false);
                onNavigate(item.route);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      <button
        type="button"
        className="pill topbar-trust-mobile"
        onClick={onOpenTrust}
        aria-label="Open Trust panel"
      >
        <span className="dot" aria-hidden="true" />
        {t(locale, 'trust.pill')}
        {swReady ? ` · ${t(locale, 'trust.offline')}` : ''}
      </button>
    </header>
  );
}
