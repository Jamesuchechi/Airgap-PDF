import type { Asset, FormFieldInfo } from '@airgap-pdf/core';
import { useEffect, useState } from 'react';
import { cantooPdfEngine } from '../engines/cantooPdfLib.js';

interface FormFillEditorProps {
  asset: Asset;
  disabled: boolean;
  onApply: (values: Record<string, string | boolean>, flatten: boolean) => void;
}

export function FormFillEditor({ asset, disabled, onApply }: FormFillEditorProps) {
  const [fields, setFields] = useState<FormFieldInfo[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [flatten, setFlatten] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const doc = await cantooPdfEngine.open(asset);
        if (cancelled) return;
        const discovered = doc.getFormFields();
        setFields(discovered);
        const init: Record<string, string | boolean> = {};
        for (const f of discovered) init[f.name] = f.value;
        setValues(init);
      } catch (err) {
        if (!cancelled) {
          setFields([]);
          setError(err instanceof Error ? err.message : 'Could not inspect form fields.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset]);

  if (error) {
    return <div className="alert">{error}</div>;
  }

  if (fields.length === 0) {
    return (
      <div className="mono" style={{ padding: '8px 0' }}>
        No fillable AcroForm fields found in this PDF.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {fields.map((f) => {
        if (f.type === 'checkbox') {
          return (
            <label
              key={f.name}
              style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 40 }}
            >
              <input
                type="checkbox"
                checked={Boolean(values[f.name])}
                onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.checked }))}
              />
              <span>{f.name}</span>
            </label>
          );
        }
        if ((f.type === 'dropdown' || f.type === 'radio') && f.options?.length) {
          return (
            <label key={f.name} style={{ display: 'grid', gap: 6 }}>
              <span className="mono">{f.name}</span>
              <select
                className="text-input"
                value={String(values[f.name] ?? '')}
                onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
              >
                {f.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        return (
          <label key={f.name} style={{ display: 'grid', gap: 6 }}>
            <span className="mono">{f.name}</span>
            <input
              type="text"
              className="text-input"
              value={String(values[f.name] ?? '')}
              onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
            />
          </label>
        );
      })}

      <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 40 }}>
        <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
        <span>Flatten form fields into static PDF</span>
      </label>

      <button
        type="button"
        className="btn"
        disabled={disabled}
        onClick={() => onApply(values, flatten)}
      >
        Apply &amp; Save PDF
      </button>
    </div>
  );
}
