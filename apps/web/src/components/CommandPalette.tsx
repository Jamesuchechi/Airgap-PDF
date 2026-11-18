import { useEffect, useState } from 'react';
import { TOOLS } from '../tools/registry.js';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectTool: (toolId: string) => void;
}

export function CommandPalette({ open, onClose, onSelectTool }: CommandPaletteProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  if (!open) return null;

  const filtered = TOOLS.filter(
    (t) =>
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.summary.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="panel modal-card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="search"
            className="text-input"
            placeholder="Search tools (e.g. rotate)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && filtered[0]) {
                onSelectTool(filtered[0].id);
                onClose();
              }
            }}
          />
          <button type="button" className="btn2" onClick={onClose}>
            Esc
          </button>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          {filtered.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className="ghost"
              onClick={() => {
                onSelectTool(tool.id);
                onClose();
              }}
            >
              <div style={{ fontWeight: 600 }}>{tool.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{tool.summary}</div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="mono" style={{ padding: 8 }}>
              No matching tools
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
