interface TopBarProps {
  onHome: () => void;
  onOpenTrust: () => void;
  swReady: boolean;
}

export function TopBar({ onHome, onOpenTrust, swReady }: TopBarProps) {
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
      <button
        type="button"
        className="pill"
        data-testid="trust-pill"
        onClick={onOpenTrust}
        aria-label="Open Trust panel"
      >
        <span className="dot" aria-hidden="true" />0 OBSERVED REQUESTS · CSP ACTIVE
        {swReady ? ' · OFFLINE READY' : ''}
      </button>
    </header>
  );
}
