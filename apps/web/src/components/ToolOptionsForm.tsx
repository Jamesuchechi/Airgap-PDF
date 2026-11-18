import { isValidPageRange, z } from '@airgap-pdf/core';
import type { ComponentType } from 'react';

export interface FieldOverrideProps {
  name: string;
  value: unknown;
  onChange: (next: unknown) => void;
}

interface ToolOptionsFormProps {
  schema: z.ZodTypeAny;
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  overrides?: Record<string, ComponentType<FieldOverrideProps>>;
}

function unwrapSchema(field: z.ZodTypeAny): z.ZodTypeAny {
  let cur = field;
  while (cur instanceof z.ZodDefault || cur instanceof z.ZodOptional) {
    cur = cur._def.innerType;
  }
  return cur;
}

export function ToolOptionsForm({ schema, values, onChange, overrides }: ToolOptionsFormProps) {
  if (!(schema instanceof z.ZodObject)) {
    return null;
  }

  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const update = (key: string, val: unknown) => onChange({ ...values, [key]: val });

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {Object.entries(shape).map(([key, rawField]) => {
        const Override = overrides?.[key];
        if (Override) {
          return (
            <Override
              key={key}
              name={key}
              value={values[key]}
              onChange={(next) => update(key, next)}
            />
          );
        }

        const inner = unwrapSchema(rawField);
        const label = rawField.description ?? key;

        if (inner instanceof z.ZodUnion) {
          const opts = (inner._def.options as z.ZodTypeAny[]).filter(
            (o): o is z.ZodLiteral<string | number> => o instanceof z.ZodLiteral,
          );
          if (opts.length > 0) {
            return (
              <div key={key}>
                <div className="mono" style={{ marginBottom: 6 }}>
                  {label}
                </div>
                <fieldset
                  className="seg"
                  style={{ border: 0, padding: 0, margin: 0 }}
                  aria-label={label}
                >
                  {opts.map((o) => {
                    const lit = o.value;
                    return (
                      <button
                        key={String(lit)}
                        type="button"
                        aria-pressed={values[key] === lit}
                        onClick={() => update(key, lit)}
                      >
                        {String(lit)}
                      </button>
                    );
                  })}
                </fieldset>
              </div>
            );
          }
        }

        if (inner instanceof z.ZodEnum) {
          const options = inner._def.values as string[];
          return (
            <label key={key} style={{ display: 'grid', gap: 6 }}>
              <span className="mono">{label}</span>
              <select
                className="text-input"
                value={String(values[key] ?? options[0] ?? '')}
                onChange={(e) => update(key, e.target.value)}
              >
                {options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (inner instanceof z.ZodBoolean) {
          return (
            <label
              key={key}
              style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}
            >
              <input
                type="checkbox"
                checked={Boolean(values[key])}
                onChange={(e) => update(key, e.target.checked)}
              />
              <span>{label}</span>
            </label>
          );
        }

        if (inner instanceof z.ZodNumber) {
          return (
            <label key={key} style={{ display: 'grid', gap: 6 }}>
              <span className="mono">{label}</span>
              <input
                type="number"
                className="text-input"
                value={Number(values[key] ?? 0)}
                onChange={(e) => update(key, Number(e.target.value))}
              />
            </label>
          );
        }

        const strVal = String(values[key] ?? '');
        const isPageField = key === 'pages' || /page/i.test(label);
        const invalidPage = isPageField && strVal.length > 0 && !isValidPageRange(strVal);

        return (
          <label key={key} style={{ display: 'grid', gap: 6 }}>
            <span className="mono">{label}</span>
            <input
              type="text"
              className="text-input"
              aria-invalid={invalidPage || undefined}
              value={strVal}
              onChange={(e) => update(key, e.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}
