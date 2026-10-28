/**
 * Tiny JSON-schema subset used by the AI tasks: enough to (a) describe the expected output to any model,
 * (b) validate what comes back before it is cached or shown. No dependency, isomorphic (browser + server).
 */
export type JsonType = 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';
export interface JsonSchema {
  type: JsonType;
  enum?: readonly string[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  nullable?: boolean;
  /** array bounds */
  minItems?: number;
  maxItems?: number;
  maxLength?: number;
}

/** Returns a list of human-readable problems (empty = valid). Unknown object keys are ignored, not errors. */
export function validate(value: unknown, schema: JsonSchema, path = '$'): string[] {
  if (value === null || value === undefined) return schema.nullable ? [] : [`${path}: missing/null`];
  const errs: string[] = [];
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') return [`${path}: expected string`];
      if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: "${value}" not in enum`);
      if (schema.maxLength && value.length > schema.maxLength) errs.push(`${path}: longer than ${schema.maxLength}`);
      return errs;
    case 'integer':
      return Number.isInteger(value) ? [] : [`${path}: expected integer`];
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? [] : [`${path}: expected number`];
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${path}: expected boolean`];
    case 'array': {
      if (!Array.isArray(value)) return [`${path}: expected array`];
      if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(`${path}: fewer than ${schema.minItems} items`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${path}: more than ${schema.maxItems} items`);
      if (schema.items) value.forEach((v, i) => errs.push(...validate(v, schema.items!, `${path}[${i}]`)));
      return errs;
    }
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) return [`${path}: expected object`];
      const obj = value as Record<string, unknown>;
      for (const key of schema.required ?? []) if (obj[key] === undefined) errs.push(`${path}.${key}: required`);
      for (const [key, sub] of Object.entries(schema.properties ?? {})) if (obj[key] !== undefined) errs.push(...validate(obj[key], sub, `${path}.${key}`));
      return errs;
    }
  }
}

/** Compact schema text for the prompt, e.g. {"year": integer, "type": "a"|"b", "coordinates"?: [number]} */
export function describe(schema: JsonSchema, required = true): string {
  const nul = schema.nullable ? ' | null' : '';
  switch (schema.type) {
    case 'string': return (schema.enum ? schema.enum.map(e => JSON.stringify(e)).join(' | ') : 'string') + nul;
    case 'integer': case 'number': case 'boolean': return schema.type + nul;
    case 'array': return `[${schema.items ? describe(schema.items) : 'any'}, ...]` + nul;
    case 'object': {
      const req = new Set(schema.required ?? []);
      const fields = Object.entries(schema.properties ?? {}).map(([k, v]) => `"${k}"${req.has(k) ? '' : '?'}: ${describe(v)}`);
      return `{ ${fields.join(', ')} }` + nul;
    }
  }
  void required;
}

/** Providers that only guarantee a JSON *object* need array roots wrapped. */
export const wrapRoot = (schema: JsonSchema): JsonSchema =>
  schema.type === 'array' ? { type: 'object', properties: { items: schema }, required: ['items'] } : schema;
