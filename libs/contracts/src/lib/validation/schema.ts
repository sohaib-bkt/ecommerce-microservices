/**
 * A tiny, dependency-free schema validator.
 *
 * It exists so that shared event contracts can be checked at runtime on both
 * the producer and the consumer side. Hand-rolling this keeps the workspace
 * free of a validation dependency while still giving us a real runtime check.
 */

/** A validation rule for a single field of an object. */
export type FieldRule =
  | {
      type: 'string';
      minLength?: number;
      maxLength?: number;
      pattern?: RegExp;
      optional?: boolean;
    }
  | {
      type: 'number';
      min?: number;
      max?: number;
      integer?: boolean;
      optional?: boolean;
    }
  | { type: 'boolean'; optional?: boolean }
  | { type: 'timestamp'; optional?: boolean }
  | { type: 'enum'; values: readonly string[]; optional?: boolean }
  | {
      type: 'object';
      fields: Record<string, FieldRule>;
      optional?: boolean;
    }
  | { type: 'array'; items: FieldRule; optional?: boolean }
  | { type: 'unknown'; optional?: boolean };

/** A schema describing the shape of an object. */
export type ObjectSchema = {
  readonly [key: string]: FieldRule;
};

/**
 * Declares a schema while preserving the literal types of each rule.
 *
 * A plain `satisfies ObjectSchema` widens `type: 'string'` to `string`, which
 * then no longer matches the `FieldRule` union. This helper keeps the literal
 * types intact so the schema is checked against `ObjectSchema` exactly.
 */
export function defineSchema<const T extends ObjectSchema>(schema: T): T {
  return schema;
}

/**
 * Declares a single rule while preserving its literal types.
 *
 * Use this for standalone rules (such as a reusable nested object rule).
 * `defineSchema` is for whole schemas, where every key maps to a rule.
 */
export function defineRule<const T extends FieldRule>(rule: T): T {
  return rule;
}

/** Describes why a payload failed validation. */
export class SchemaValidationError extends Error {
  constructor(
    message: string,
    readonly path: string,
    readonly value: unknown,
  ) {
    super(`${path}: ${message}`);
    this.name = 'SchemaValidationError';
  }
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validateField(value: unknown, rule: FieldRule, path: string): void {
  switch (rule.type) {
    case 'unknown':
      return;

    case 'string': {
      if (typeOf(value) !== 'string') {
        throw new SchemaValidationError(
          `expected string, received ${typeOf(value)}`,
          path,
          value,
        );
      }
      const str = value as string;
      if (rule.minLength !== undefined && str.length < rule.minLength) {
        throw new SchemaValidationError(
          `expected at least ${rule.minLength} character(s), received ${str.length}`,
          path,
          value,
        );
      }
      if (rule.maxLength !== undefined && str.length > rule.maxLength) {
        throw new SchemaValidationError(
          `expected at most ${rule.maxLength} character(s), received ${str.length}`,
          path,
          value,
        );
      }
      if (rule.pattern !== undefined && !rule.pattern.test(str)) {
        throw new SchemaValidationError(
          `expected to match ${rule.pattern}`,
          path,
          value,
        );
      }
      return;
    }

    case 'number': {
      if (typeOf(value) !== 'number') {
        throw new SchemaValidationError(
          `expected number, received ${typeOf(value)}`,
          path,
          value,
        );
      }
      const num = value as number;
      if (Number.isNaN(num) || !Number.isFinite(num)) {
        throw new SchemaValidationError(
          'expected a finite number',
          path,
          value,
        );
      }
      if (rule.integer && !Number.isInteger(num)) {
        throw new SchemaValidationError('expected an integer', path, value);
      }
      if (rule.min !== undefined && num < rule.min) {
        throw new SchemaValidationError(
          `expected >= ${rule.min}, received ${num}`,
          path,
          value,
        );
      }
      if (rule.max !== undefined && num > rule.max) {
        throw new SchemaValidationError(
          `expected <= ${rule.max}, received ${num}`,
          path,
          value,
        );
      }
      return;
    }

    case 'boolean': {
      if (typeOf(value) !== 'boolean') {
        throw new SchemaValidationError(
          `expected boolean, received ${typeOf(value)}`,
          path,
          value,
        );
      }
      return;
    }

    case 'timestamp': {
      if (typeOf(value) !== 'string') {
        throw new SchemaValidationError(
          `expected an ISO-8601 timestamp string, received ${typeOf(value)}`,
          path,
          value,
        );
      }
      const parsed = Date.parse(value as string);
      if (Number.isNaN(parsed)) {
        throw new SchemaValidationError(
          'expected a valid ISO-8601 timestamp',
          path,
          value,
        );
      }
      return;
    }

    case 'enum': {
      if (typeOf(value) !== 'string') {
        throw new SchemaValidationError(
          `expected string, received ${typeOf(value)}`,
          path,
          value,
        );
      }
      if (!rule.values.includes(value as string)) {
        throw new SchemaValidationError(
          `expected one of ${rule.values.join(', ')}, received "${value}"`,
          path,
          value,
        );
      }
      return;
    }

    case 'object': {
      if (typeOf(value) !== 'object') {
        throw new SchemaValidationError(
          `expected object, received ${typeOf(value)}`,
          path,
          value,
        );
      }
      validateObject(value as Record<string, unknown>, rule.fields, path);
      return;
    }

    case 'array': {
      if (typeOf(value) !== 'array') {
        throw new SchemaValidationError(
          `expected array, received ${typeOf(value)}`,
          path,
          value,
        );
      }
      (value as unknown[]).forEach((item, index) => {
        validateField(item, rule.items, `${path}[${index}]`);
      });
      return;
    }
  }
}

/**
 * Validates `value` against `schema`.
 *
 * Fields present in the schema but missing from the value are rejected, unless
 * the field's rule declares `optional: true`.
 */
export function validateObject(
  value: Record<string, unknown>,
  schema: ObjectSchema,
  path = '$',
): void {
  if (typeOf(value) !== 'object') {
    throw new SchemaValidationError(
      `expected object, received ${typeOf(value)}`,
      path,
      value,
    );
  }

  for (const [key, rule] of Object.entries(schema)) {
    const fieldPath = `${path}.${key}`;
    const present = Object.prototype.hasOwnProperty.call(value, key);
    const isOptional = 'optional' in rule && rule.optional === true;

    if (!present || value[key] === undefined) {
      if (isOptional) continue;
      throw new SchemaValidationError('is required', fieldPath, value[key]);
    }

    validateField(value[key], rule, fieldPath);
  }
}

/**
 * Validates `value` against `schema` and returns the value typed as `T`.
 *
 * The cast is safe only when the schema was authored alongside the `T` type;
 * that coupling is enforced by the schema tests in this library.
 */
export function parse<T>(value: unknown, schema: ObjectSchema, path = '$'): T {
  if (typeOf(value) !== 'object') {
    throw new SchemaValidationError(
      `expected object, received ${typeOf(value)}`,
      path,
      value,
    );
  }
  validateObject(value as Record<string, unknown>, schema, path);
  return value as T;
}
