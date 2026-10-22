import { defineSchema } from '../validation/schema.js';
import type { Money } from './envelope.js';
import type { EventEnvelope } from './envelope.js';
import { envelopeSchema, moneySchema } from './envelope.js';

/**
 * Events emitted by the payment service.
 */

export interface PaymentInitiatedPayload {
  paymentId: string;
  orderId: string;
  accountId: string;
  amount: Money;
  methodType: PaymentMethodType;
}

export interface PaymentAuthorizedPayload {
  paymentId: string;
  orderId: string;
  amount: Money;
  providerReference: string;
}

export interface PaymentCapturedPayload {
  paymentId: string;
  orderId: string;
  amount: Money;
  providerReference: string;
}

export interface PaymentFailedPayload {
  paymentId: string;
  orderId: string;
  amount: Money;
  reason: string;
  /** True when the failure is retryable with the same method. */
  retryable: boolean;
}

export interface PaymentRefundedPayload {
  paymentId: string;
  orderId: string;
  amount: Money;
  reason: string;
}

export const PAYMENT_STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'REFUNDED',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHOD_TYPES = [
  'CARD',
  'BANK_TRANSFER',
  'WALLET',
] as const;

export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export const paymentInitiatedSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['PaymentInitiated'] },
  payload: {
    type: 'object',
    fields: {
      paymentId: { type: 'string', minLength: 1 },
      orderId: { type: 'string', minLength: 1 },
      accountId: { type: 'string', minLength: 1 },
      amount: { type: 'object', fields: moneySchema },
      methodType: { type: 'enum', values: PAYMENT_METHOD_TYPES },
    },
  },
});

export const paymentAuthorizedSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['PaymentAuthorized'] },
  payload: {
    type: 'object',
    fields: {
      paymentId: { type: 'string', minLength: 1 },
      orderId: { type: 'string', minLength: 1 },
      amount: { type: 'object', fields: moneySchema },
      providerReference: { type: 'string', minLength: 1 },
    },
  },
});

export const paymentCapturedSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['PaymentCaptured'] },
  payload: {
    type: 'object',
    fields: {
      paymentId: { type: 'string', minLength: 1 },
      orderId: { type: 'string', minLength: 1 },
      amount: { type: 'object', fields: moneySchema },
      providerReference: { type: 'string', minLength: 1 },
    },
  },
});

export const paymentFailedSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['PaymentFailed'] },
  payload: {
    type: 'object',
    fields: {
      paymentId: { type: 'string', minLength: 1 },
      orderId: { type: 'string', minLength: 1 },
      amount: { type: 'object', fields: moneySchema },
      reason: { type: 'string', minLength: 1 },
      retryable: { type: 'boolean' },
    },
  },
});

export const paymentRefundedSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['PaymentRefunded'] },
  payload: {
    type: 'object',
    fields: {
      paymentId: { type: 'string', minLength: 1 },
      orderId: { type: 'string', minLength: 1 },
      amount: { type: 'object', fields: moneySchema },
      reason: { type: 'string', minLength: 1 },
    },
  },
});

/** A payment service event, ready to be published to the bus. */
export type PaymentEvent =
  | EventEnvelope<'PaymentInitiated', PaymentInitiatedPayload>
  | EventEnvelope<'PaymentAuthorized', PaymentAuthorizedPayload>
  | EventEnvelope<'PaymentCaptured', PaymentCapturedPayload>
  | EventEnvelope<'PaymentFailed', PaymentFailedPayload>
  | EventEnvelope<'PaymentRefunded', PaymentRefundedPayload>;

/** Schema for the `PaymentInitiated` event. */
export const PAYMENT_INITIATED_EVENT = 'PaymentInitiated';

/** Schema for the `PaymentAuthorized` event. */
export const PAYMENT_AUTHORIZED_EVENT = 'PaymentAuthorized';

/** Schema for the `PaymentCaptured` event. */
export const PAYMENT_CAPTURED_EVENT = 'PaymentCaptured';

/** Schema for the `PaymentFailed` event. */
export const PAYMENT_FAILED_EVENT = 'PaymentFailed';

/** Schema for the `PaymentRefunded` event. */
export const PAYMENT_REFUNDED_EVENT = 'PaymentRefunded';
