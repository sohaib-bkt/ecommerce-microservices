import { describe, expect, it } from '@jest/globals';
import { SchemaValidationError, parse, validateObject } from './schema.js';

describe('schema validation', () => {
  const schema = {
    id: { type: 'string', minLength: 1 },
    count: { type: 'number', integer: true, min: 0 },
    enabled: { type: 'boolean' },
    kind: { type: 'enum', values: ['A', 'B'] },
    note: { type: 'string', optional: true },
    nested: {
      type: 'object',
      fields: { value: { type: 'number' } },
    },
    list: { type: 'array', items: { type: 'string' } },
  } as const;

  const valid = {
    id: 'abc',
    count: 3,
    enabled: true,
    kind: 'A',
    nested: { value: 1 },
    list: ['x'],
  };

  it('accepts a valid payload', () => {
    expect(() => validateObject(valid, schema)).not.toThrow();
  });

  it('allows optional fields to be absent', () => {
    expect(() => validateObject(valid, schema)).not.toThrow();
    expect('note' in valid).toBe(false);
  });

  it('rejects a missing required field', () => {
    const { id, ...withoutId } = valid;
    expect(id).toBe('abc');
    expect(() => validateObject(withoutId, schema)).toThrow(
      SchemaValidationError,
    );
    expect(() => validateObject(withoutId, schema)).toThrow(
      /\$\.id: is required/,
    );
  });

  it('rejects a field of the wrong type', () => {
    expect(() => validateObject({ ...valid, id: 42 }, schema)).toThrow(
      /expected string, received number/,
    );
  });

  it('rejects a string that is too short', () => {
    expect(() => validateObject({ ...valid, id: '' }, schema)).toThrow(
      /at least 1 character/,
    );
  });

  it('rejects a non-integer number', () => {
    expect(() => validateObject({ ...valid, count: 1.5 }, schema)).toThrow(
      /expected an integer/,
    );
  });

  it('rejects a negative number when min is set', () => {
    expect(() => validateObject({ ...valid, count: -1 }, schema)).toThrow(
      /expected >= 0/,
    );
  });

  it('rejects a value outside an enum', () => {
    expect(() => validateObject({ ...valid, kind: 'C' }, schema)).toThrow(
      /expected one of A, B/,
    );
  });

  it('rejects a non-boolean', () => {
    expect(() => validateObject({ ...valid, enabled: 'yes' }, schema)).toThrow(
      /expected boolean/,
    );
  });

  it('validates nested objects', () => {
    expect(() =>
      validateObject({ ...valid, nested: { value: 'nope' } }, schema),
    ).toThrow(/\$\.nested\.value: expected number/);
  });

  it('validates array items', () => {
    expect(() => validateObject({ ...valid, list: ['ok', 5] }, schema)).toThrow(
      /\$\.list\[1\]: expected string/,
    );
  });

  it('reports the path of the offending field', () => {
    try {
      validateObject({ ...valid, list: [1] }, schema);
      throw new Error('expected validation to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      expect((error as SchemaValidationError).path).toBe('$.list[0]');
    }
  });

  it('rejects a non-object payload', () => {
    expect(() => validateObject('nope' as never, schema)).toThrow(
      /expected object, received string/,
    );
  });

  it('parse returns the typed value when valid', () => {
    const result = parse<{ id: string }>(valid, schema);
    expect(result.id).toBe('abc');
  });

  it('parse throws when invalid', () => {
    expect(() => parse(valid.id, schema)).toThrow(SchemaValidationError);
  });
});
