import { useObservedRequests } from '../utils/trustObserver.js';

interface TrustModalProps {
  open: boolean;
  onClose: () => void;
  workerStatus: string;
  swStatus: string;
}

export function TrustModal({ open, onClose, workerStatus, swStatus }: TrustModalProps) {
  const requests = useObservedRequests();
  if (!open) return null;

  const offOriginCount = requests.filter((r) => !r.sameOrigin).length;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trust-modal-title"
    >
      <div className="panel modal-card" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id="trust-modal-title" style={{ margin: 0, font: '400 28px var(--font-serif)' }}>
            Trust &amp; Verification
          </h2>
          <button type="button" className="btn2" onClick={onClose}>
            Close
          </button>
        </div>

        <p style={{ margin: 0, color: '#B4BEB8', fontFamily: 'var(--font-sans)', fontSize: 14 }}>
          Airgap is a static site with no backend. &ldquo;Observed requests&rdquo; is a best-effort
          in-page view; the real guarantee is the strict <code>connect-src &apos;self&apos;</code>{' '}
          CSP and public CI zero-network tests.
        </p>

        <div className="row">
          <span className="mono">Observed off-origin requests</span>
          <span style={{ color: offOriginCount === 0 ? 'var(--accent)' : '#FFB454' }}>
            {offOriginCount}
          </span>
        </div>
        <div className="row">
          <span className="mono">Allowed origin</span>
          <span>{typeof location !== 'undefined' ? location.origin : 'self'}</span>
        </div>
        <div className="row">
          <span className="mono">CSP policy</span>
          <span style={{ color: 'var(--accent)' }}>connect-src &apos;self&apos;</span>
        </div>
        <div className="row">
          <span className="mono">Shimmed worker</span>
          <span>{workerStatus}</span>
        </div>
        <div className="row">
          <span className="mono">Service worker</span>
          <span>{swStatus}</span>
        </div>

        <div
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 12,
            fontSize: 12,
          }}
        >
          <div className="mono" style={{ marginBottom: 6 }}>
            Observed session log ({requests.length} same-origin static loads)
          </div>
          <div style={{ maxHeight: 120, overflowY: 'auto', display: 'grid', gap: 4 }}>
            {requests.slice(-10).map((req) => (
              <div
                key={`${req.timestamp}-${req.url}-${req.initiator}`}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}
              >
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  [{req.source}/{req.initiator}] {req.url}
                </span>
                <span style={{ color: req.sameOrigin ? 'var(--accent)' : '#FFB454' }}>
                  {req.sameOrigin ? 'self' : 'off-origin'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 12,
            fontSize: 12,
          }}
        >
          <div className="mono" style={{ marginBottom: 4 }}>
            Verify deployed build in 30 seconds
          </div>
          <code>npx @airgap-pdf/verify https://jamesuchechi.github.io/airgap-pdf/</code>
        </div>
      </div>
    </div>
  );
}
