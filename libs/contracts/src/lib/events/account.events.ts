import { defineSchema } from '../validation/schema.js';
import type { EventEnvelope } from './envelope.js';
import { addressSchema, envelopeSchema, moneySchema } from './envelope.js';

/**
 * Events emitted by the account service.
 *
 * The `type` string of each event is the contract: consumers subscribe to it
 * and must not rely on the TypeScript type alone.
 */

export interface AccountRegisteredPayload {
  accountId: string;
  email: string;
  displayName: string;
}

export interface AccountUpdatedPayload {
  accountId: string;
  displayName?: string;
  status?: AccountStatus;
}

export interface AccountSuspendedPayload {
  accountId: string;
  reason: string;
}

export const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED', 'CLOSED'] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const accountRegisteredSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['AccountRegistered'] },
  payload: {
    type: 'object',
    fields: {
      accountId: { type: 'string', minLength: 1 },
      email: { type: 'string', minLength: 3 },
      displayName: { type: 'string', minLength: 1 },
    },
  },
});

export const accountUpdatedSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['AccountUpdated'] },
  payload: {
    type: 'object',
    fields: {
      accountId: { type: 'string', minLength: 1 },
      displayName: { type: 'string', minLength: 1, optional: true },
      status: { type: 'enum', values: ACCOUNT_STATUSES, optional: true },
    },
  },
});

export const accountSuspendedSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['AccountSuspended'] },
  payload: {
    type: 'object',
    fields: {
      accountId: { type: 'string', minLength: 1 },
      reason: { type: 'string', minLength: 1 },
    },
  },
});

/** An account service event, ready to be published to the bus. */
export type AccountEvent =
  | EventEnvelope<'AccountRegistered', AccountRegisteredPayload>
  | EventEnvelope<'AccountUpdated', AccountUpdatedPayload>
  | EventEnvelope<'AccountSuspended', AccountSuspendedPayload>;

/** Schema for the `AccountRegistered` event. */
export const ACCOUNT_REGISTERED_EVENT = 'AccountRegistered';

/** Schema for the `AccountUpdated` event. */
export const ACCOUNT_UPDATED_EVENT = 'AccountUpdated';

/** Schema for the `AccountSuspended` event. */
export const ACCOUNT_SUSPENDED_EVENT = 'AccountSuspended';

/** Address schema re-exported for consumers building account events. */
export { addressSchema, moneySchema };
