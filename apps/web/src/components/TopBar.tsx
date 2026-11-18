import { LOCALES, type Locale, t } from '../i18n/messages.js';

interface TopBarProps {
  onHome: () => void;
  onOpenTrust: () => void;
  swReady: boolean;
  locale: Locale;
  onChangeLocale: (next: Locale) => void;
}

export function TopBar({ onHome, onOpenTrust, swReady, locale, onChangeLocale }: TopBarProps) {
  return (
    <header className="topbar">
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <select
          aria-label="Language"
          value={locale}
          onChange={(e) => onChangeLocale(e.target.value as Locale)}
          className="mono"
          style={{
            background: 'transparent',
            color: 'var(--muted)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '4px 10px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="pill"
          data-testid="trust-pill"
          onClick={onOpenTrust}
          aria-label="Open Trust panel"
        >
          <span className="dot" aria-hidden="true" />
          {t(locale, 'trust.pill')}
          {swReady ? ` · ${t(locale, 'trust.offline')}` : ''}
        </button>
      </div>
    </header>
  );
}
