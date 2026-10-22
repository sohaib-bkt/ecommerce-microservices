import { defineRule, defineSchema } from '../validation/schema.js';
import type { Address, Money } from './envelope.js';
import type { EventEnvelope } from './envelope.js';
import { addressSchema, envelopeSchema, moneySchema } from './envelope.js';

/**
 * Events emitted by the order service.
 */

export interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: Money;
}

export interface OrderCreatedPayload {
  orderId: string;
  accountId: string;
  items: OrderItem[];
  total: Money;
  shippingAddress?: Address;
}

export interface OrderConfirmedPayload {
  orderId: string;
  accountId: string;
  total: Money;
}

export interface OrderStatusChangedPayload {
  orderId: string;
  previousStatus: OrderStatus;
  status: OrderStatus;
  reason?: string;
}

export interface OrderCancelledPayload {
  orderId: string;
  accountId: string;
  reason: string;
  /** True when the cancellation triggers a refund. */
  requiresRefund: boolean;
}

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const orderItemSchema = defineRule({
  type: 'object',
  fields: {
    productId: { type: 'string', minLength: 1 },
    sku: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    quantity: { type: 'number', integer: true, min: 1 },
    unitPrice: { type: 'object', fields: moneySchema },
  },
});

export const orderCreatedSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['OrderCreated'] },
  payload: {
    type: 'object',
    fields: {
      orderId: { type: 'string', minLength: 1 },
      accountId: { type: 'string', minLength: 1 },
      items: { type: 'array', items: orderItemSchema },
      total: { type: 'object', fields: moneySchema },
      shippingAddress: {
        type: 'object',
        fields: addressSchema,
        optional: true,
      },
    },
  },
});

export const orderConfirmedSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['OrderConfirmed'] },
  payload: {
    type: 'object',
    fields: {
      orderId: { type: 'string', minLength: 1 },
      accountId: { type: 'string', minLength: 1 },
      total: { type: 'object', fields: moneySchema },
    },
  },
});

export const orderStatusChangedSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['OrderStatusChanged'] },
  payload: {
    type: 'object',
    fields: {
      orderId: { type: 'string', minLength: 1 },
      previousStatus: { type: 'enum', values: ORDER_STATUSES },
      status: { type: 'enum', values: ORDER_STATUSES },
      reason: { type: 'string', minLength: 1, optional: true },
    },
  },
});

export const orderCancelledSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['OrderCancelled'] },
  payload: {
    type: 'object',
    fields: {
      orderId: { type: 'string', minLength: 1 },
      accountId: { type: 'string', minLength: 1 },
      reason: { type: 'string', minLength: 1 },
      requiresRefund: { type: 'boolean' },
    },
  },
});

/** An order service event, ready to be published to the bus. */
export type OrderEvent =
  | EventEnvelope<'OrderCreated', OrderCreatedPayload>
  | EventEnvelope<'OrderConfirmed', OrderConfirmedPayload>
  | EventEnvelope<'OrderStatusChanged', OrderStatusChangedPayload>
  | EventEnvelope<'OrderCancelled', OrderCancelledPayload>;

/** Schema for the `OrderCreated` event. */
export const ORDER_CREATED_EVENT = 'OrderCreated';

/** Schema for the `OrderConfirmed` event. */
export const ORDER_CONFIRMED_EVENT = 'OrderConfirmed';

/** Schema for the `OrderStatusChanged` event. */
export const ORDER_STATUS_CHANGED_EVENT = 'OrderStatusChanged';

/** Schema for the `OrderCancelled` event. */
export const ORDER_CANCELLED_EVENT = 'OrderCancelled';
