import { describe, expect, it } from '@jest/globals';
import {
  EVENT_SCHEMAS,
  EVENT_TYPES,
  getEventSchema,
  isEventType,
} from './registry.js';
import { parse } from '../validation/schema.js';

const baseEnvelope = {
  id: 'evt-1',
  occurredAt: 1_700_000_000_000,
  source: 'order-service',
  version: 1,
};

describe('event registry', () => {
  it('registers every known event exactly once', () => {
    expect(EVENT_TYPES.length).toBe(Object.keys(EVENT_SCHEMAS).length);
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length);
  });

  it('covers all four service domains', () => {
    expect(EVENT_TYPES.filter((t) => t.startsWith('Account')).length).toBe(3);
    expect(EVENT_TYPES.filter((t) => t.startsWith('Product')).length).toBe(3);
    expect(EVENT_TYPES.filter((t) => t.startsWith('Order')).length).toBe(4);
    expect(EVENT_TYPES.filter((t) => t.startsWith('Payment')).length).toBe(5);
  });

  it('resolves a known event schema', () => {
    expect(getEventSchema('OrderCreated')).toBe(EVENT_SCHEMAS.OrderCreated);
  });

  it('throws for an unknown event', () => {
    expect(() => getEventSchema('NotAnEvent')).toThrow(
      /Unknown event type: NotAnEvent/,
    );
  });

  it('narrows event types', () => {
    expect(isEventType('PaymentCaptured')).toBe(true);
    expect(isEventType('PaymentNope')).toBe(false);
  });
});

describe('event schemas', () => {
  it('accepts a valid OrderCreated event', () => {
    const event = {
      ...baseEnvelope,
      type: 'OrderCreated',
      payload: {
        orderId: 'order-1',
        accountId: 'account-1',
        items: [
          {
            productId: 'product-1',
            sku: 'SKU-1',
            name: 'Widget',
            quantity: 2,
            unitPrice: { currency: 'USD', amount: 1999 },
          },
        ],
        total: { currency: 'USD', amount: 3998 },
      },
    };

    expect(() => parse(event, EVENT_SCHEMAS.OrderCreated)).not.toThrow();
  });

  it('rejects an OrderCreated event whose type does not match', () => {
    const event = {
      ...baseEnvelope,
      type: 'OrderCancelled',
      payload: {
        orderId: 'order-1',
        accountId: 'account-1',
        items: [],
        total: { currency: 'USD', amount: 0 },
      },
    };

    expect(() => parse(event, EVENT_SCHEMAS.OrderCreated)).toThrow(
      /expected one of OrderCreated/,
    );
  });

  it('rejects a missing payload field', () => {
    const event = {
      ...baseEnvelope,
      type: 'PaymentCaptured',
      payload: {
        paymentId: 'payment-1',
        orderId: 'order-1',
        // amount missing
      },
    };

    expect(() => parse(event, EVENT_SCHEMAS.PaymentCaptured)).toThrow(
      /\$\.payload\.amount: is required/,
    );
  });

  it('rejects an item with a non-positive quantity', () => {
    const event = {
      ...baseEnvelope,
      type: 'OrderCreated',
      payload: {
        orderId: 'order-1',
        accountId: 'account-1',
        items: [
          {
            productId: 'product-1',
            sku: 'SKU-1',
            name: 'Widget',
            quantity: 0,
            unitPrice: { currency: 'USD', amount: 1999 },
          },
        ],
        total: { currency: 'USD', amount: 0 },
      },
    };

    expect(() => parse(event, EVENT_SCHEMAS.OrderCreated)).toThrow(
      /expected >= 1/,
    );
  });

  it('accepts an AccountUpdated event with only optional fields changed', () => {
    const event = {
      ...baseEnvelope,
      type: 'AccountUpdated',
      payload: { accountId: 'account-1', status: 'SUSPENDED' },
    };

    expect(() => parse(event, EVENT_SCHEMAS.AccountUpdated)).not.toThrow();
  });

  it('rejects an unknown account status', () => {
    const event = {
      ...baseEnvelope,
      type: 'AccountUpdated',
      payload: { accountId: 'account-1', status: 'BANANAS' },
    };

    expect(() => parse(event, EVENT_SCHEMAS.AccountUpdated)).toThrow(
      /expected one of ACTIVE, SUSPENDED, CLOSED/,
    );
  });

  it('validates every registered event against its own envelope', () => {
    for (const schema of Object.values(EVENT_SCHEMAS)) {
      expect(schema).toBeDefined();
      // The envelope must be present on every schema.
      expect(() =>
        parse({ ...baseEnvelope, type: 'SomethingElse' }, schema),
      ).toThrow();
    }
  });
});
