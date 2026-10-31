import type { ObjectSchema } from '../validation/schema.js';
import {
  ACCOUNT_REGISTERED_EVENT,
  ACCOUNT_SUSPENDED_EVENT,
  ACCOUNT_UPDATED_EVENT,
  accountRegisteredSchema,
  accountSuspendedSchema,
  accountUpdatedSchema,
} from './account.events.js';
import {
  ORDER_CANCELLED_EVENT,
  ORDER_CONFIRMED_EVENT,
  ORDER_CREATED_EVENT,
  ORDER_STATUS_CHANGED_EVENT,
  orderCancelledSchema,
  orderConfirmedSchema,
  orderCreatedSchema,
  orderStatusChangedSchema,
} from './order.events.js';
import {
  PAYMENT_AUTHORIZED_EVENT,
  PAYMENT_CAPTURED_EVENT,
  PAYMENT_FAILED_EVENT,
  PAYMENT_INITIATED_EVENT,
  PAYMENT_REFUNDED_EVENT,
  paymentAuthorizedSchema,
  paymentCapturedSchema,
  paymentFailedSchema,
  paymentInitiatedSchema,
  paymentRefundedSchema,
} from './payment.events.js';
import {
  PRODUCT_CREATED_EVENT,
  PRODUCT_PRICE_CHANGED_EVENT,
  PRODUCT_STOCK_CHANGED_EVENT,
  PRODUCT_UPDATED_EVENT,
  productCreatedSchema,
  productPriceChangedSchema,
  productStockChangedSchema,
  productUpdatedSchema,
} from './product.events.js';

/**
 * Every event type this workspace publishes, mapped to its schema.
 *
 * Consumers use this to validate an incoming message without knowing which
 * service produced it.
 */
export const EVENT_SCHEMAS = {
  [ACCOUNT_REGISTERED_EVENT]: accountRegisteredSchema,
  [ACCOUNT_UPDATED_EVENT]: accountUpdatedSchema,
  [ACCOUNT_SUSPENDED_EVENT]: accountSuspendedSchema,
  [PRODUCT_CREATED_EVENT]: productCreatedSchema,
  [PRODUCT_UPDATED_EVENT]: productUpdatedSchema,
  [PRODUCT_PRICE_CHANGED_EVENT]: productPriceChangedSchema,
  [PRODUCT_STOCK_CHANGED_EVENT]: productStockChangedSchema,
  [ORDER_CREATED_EVENT]: orderCreatedSchema,
  [ORDER_CONFIRMED_EVENT]: orderConfirmedSchema,
  [ORDER_STATUS_CHANGED_EVENT]: orderStatusChangedSchema,
  [ORDER_CANCELLED_EVENT]: orderCancelledSchema,
  [PAYMENT_INITIATED_EVENT]: paymentInitiatedSchema,
  [PAYMENT_AUTHORIZED_EVENT]: paymentAuthorizedSchema,
  [PAYMENT_CAPTURED_EVENT]: paymentCapturedSchema,
  [PAYMENT_FAILED_EVENT]: paymentFailedSchema,
  [PAYMENT_REFUNDED_EVENT]: paymentRefundedSchema,
} as const satisfies Record<string, ObjectSchema>;

/** The name of any event published by this workspace. */
export type EventType = keyof typeof EVENT_SCHEMAS;

/** All event names, useful for registering subscribers. */
export const EVENT_TYPES = Object.keys(EVENT_SCHEMAS) as EventType[];

/**
 * Returns the schema for an event type.
 *
 * @throws if the event type is unknown.
 */
export function getEventSchema(type: string): ObjectSchema {
  const schema = (EVENT_SCHEMAS as Record<string, ObjectSchema | undefined>)[
    type
  ];
  if (!schema) {
    throw new Error(`Unknown event type: ${type}`);
  }
  return schema;
}

/** Narrows an arbitrary string to a known event type. */
export function isEventType(type: string): type is EventType {
  return Object.prototype.hasOwnProperty.call(EVENT_SCHEMAS, type);
}
