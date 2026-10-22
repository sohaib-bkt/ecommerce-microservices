import { defineSchema } from '../validation/schema.js';
import type { Address, Money } from '../../generated/common/v1/common.js';

/**
 * The envelope every cross-service event is wrapped in.
 *
 * `id` and `occurredAt` are what consumers use for idempotency and ordering,
 * so they are required on every event.
 */
export interface EventEnvelope<TType extends string, TPayload> {
  /** Unique id of this event instance. Consumers use it to deduplicate. */
  id: string;
  /** The event name, e.g. "OrderCreated". */
  type: TType;
  /** Milliseconds since the Unix epoch. */
  occurredAt: number;
  /** The service that emitted the event, e.g. "order-service". */
  source: string;
  /** Schema version of the payload, bumped on breaking payload changes. */
  version: number;
  /** The event-specific payload. */
  payload: TPayload;
}

/** Envelope fields shared by every event, without the payload. */
export const envelopeSchema = defineSchema({
  id: { type: 'string', minLength: 1 },
  type: { type: 'string', minLength: 1 },
  occurredAt: { type: 'number', integer: true, min: 0 },
  source: { type: 'string', minLength: 1 },
  version: { type: 'number', integer: true, min: 1 },
});

/**
 * Runtime schema for a monetary amount.
 *
 * Mirrors the `Money` proto message. The TypeScript type comes from the
 * generated proto code so the two can never drift apart.
 */
export const moneySchema = defineSchema({
  currency: { type: 'string', minLength: 3, maxLength: 3 },
  amount: { type: 'number', integer: true, min: 0 },
});

/**
 * Runtime schema for a postal address.
 *
 * Mirrors the `Address` proto message.
 */
export const addressSchema = defineSchema({
  line1: { type: 'string', minLength: 1 },
  line2: { type: 'string', optional: true },
  city: { type: 'string', minLength: 1 },
  region: { type: 'string', minLength: 1 },
  postalCode: { type: 'string', minLength: 1 },
  country: { type: 'string', minLength: 2, maxLength: 2 },
});

export type { Address, Money };
