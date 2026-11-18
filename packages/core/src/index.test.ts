import { describe, expect, it } from 'vitest';
import { AirgapError, DEFAULT_LIMITS, fail, ok } from './index.js';

describe('@airgap-pdf/core', () => {
  it('enforces iOS-safe canvas pixel ceiling', () => {
    expect(DEFAULT_LIMITS.maxCanvasPixels).toBe(16_777_216);
  });

  it('round-trips AirgapError through JSON serialization', () => {
    const err = new AirgapError('PasswordRequired', 'encrypted', 'Enter password', 'unlock');
    const restored = AirgapError.fromJSON(err.toJSON());
    expect(restored).toBeInstanceOf(AirgapError);
    expect(restored.code).toBe('PasswordRequired');
    expect(restored.userMessage).toBe('Enter password');
    expect(restored.action).toBe('unlock');
  });

  it('constructs ok and fail ToolResults', () => {
    expect(ok([])).toEqual({ ok: true, outputs: [] });
    const res = fail(new AirgapError('Cancelled', 'aborted', 'Job cancelled'));
    expect(res.ok).toBe(false);
  });
});
