import { z } from '@airgap-pdf/core';

export interface FlagSpec {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'json';
  values?: string[];
  defaultValue?: unknown;
  description?: string;
}

function unwrapZod(schema: z.ZodTypeAny): {
  inner: z.ZodTypeAny;
  defaultValue?: unknown;
  description?: string;
} {
  let cur: z.ZodTypeAny = schema;
  let defaultValue: unknown;
  let description: string | undefined = schema.description;

  while (cur) {
    if (cur.description && !description) description = cur.description;
    if (cur instanceof z.ZodDefault) {
      defaultValue = cur._def.defaultValue();
      cur = cur._def.innerType;
      continue;
    }
    if (cur instanceof z.ZodOptional || cur instanceof z.ZodNullable) {
      cur = cur._def.innerType;
      continue;
    }
    break;
  }

  return {
    inner: cur,
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(description !== undefined ? { description } : {}),
  };
}

export function describeFlags(schema: z.ZodTypeAny): FlagSpec[] {
  if (!(schema instanceof z.ZodObject)) return [];
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const specs: FlagSpec[] = [];

  for (const [name, rawField] of Object.entries(shape)) {
    const { inner, defaultValue, description } = unwrapZod(rawField);
    let type: FlagSpec['type'] = 'string';
    let values: string[] | undefined;

    if (inner instanceof z.ZodBoolean) {
      type = 'boolean';
    } else if (inner instanceof z.ZodNumber) {
      type = 'number';
    } else if (inner instanceof z.ZodEnum) {
      type = 'enum';
      values = inner._def.values as string[];
    } else if (inner instanceof z.ZodUnion) {
      const opts = (inner._def.options as z.ZodTypeAny[]).map((o) =>
        o instanceof z.ZodLiteral ? String(o._def.value) : '',
      );
      if (opts.every((v) => v.length > 0)) {
        type =
          typeof (inner._def.options[0] as z.ZodLiteral<unknown>)._def.value === 'number'
            ? 'number'
            : 'enum';
        values = opts;
      }
    } else if (inner instanceof z.ZodArray || inner instanceof z.ZodObject) {
      type = 'json';
    }

    specs.push({
      name,
      type,
      ...(values !== undefined ? { values } : {}),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      ...(description !== undefined ? { description } : {}),
    });
  }

  return specs;
}

export interface ParsedCliArgs {
  positional: string[];
  options: Record<string, unknown>;
  jsonOutput: boolean;
  outPath?: string;
  outDir?: string;
  help: boolean;
}

export function parseFlagsForSchema(schema: z.ZodTypeAny, argv: string[]): ParsedCliArgs {
  const specs = describeFlags(schema);
  const byName = new Map(specs.map((s) => [s.name, s]));
  const positional: string[] = [];
  const options: Record<string, unknown> = {};
  let jsonOutput = false;
  let outPath: string | undefined;
  let outDir: string | undefined;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === '-' || !arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--json') {
      jsonOutput = true;
      continue;
    }
    if (arg === '--out' || arg.startsWith('--out=')) {
      outPath = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
      continue;
    }
    if (arg === '--out-dir' || arg.startsWith('--out-dir=')) {
      outDir = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
      continue;
    }

    if (arg.startsWith('--no-')) {
      const key = arg.slice(5);
      if (byName.get(key)?.type === 'boolean') {
        options[key] = false;
        continue;
      }
    }

    const eqIdx = arg.indexOf('=');
    const rawKey = eqIdx >= 0 ? arg.slice(2, eqIdx) : arg.slice(2);
    const spec = byName.get(rawKey);
    if (!spec) {
      throw new Error(`Unknown flag: --${rawKey}`);
    }

    if (spec.type === 'boolean' && eqIdx < 0) {
      const next = argv[i + 1];
      if (next === 'true' || next === 'false') {
        options[rawKey] = next === 'true';
        i++;
      } else {
        options[rawKey] = true;
      }
      continue;
    }

    const rawVal = eqIdx >= 0 ? arg.slice(eqIdx + 1) : argv[++i];
    if (rawVal === undefined) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    if (spec.type === 'boolean') {
      options[rawKey] = rawVal === 'true' || rawVal === '1';
    } else if (spec.type === 'number') {
      const num = Number(rawVal);
      if (Number.isNaN(num)) throw new Error(`Invalid number for --${rawKey}: ${rawVal}`);
      options[rawKey] = num;
    } else if (spec.type === 'json') {
      options[rawKey] = JSON.parse(rawVal);
    } else {
      options[rawKey] = rawVal;
    }
  }

  return {
    positional,
    options,
    jsonOutput,
    ...(outPath !== undefined ? { outPath } : {}),
    ...(outDir !== undefined ? { outDir } : {}),
    help,
  };
}
