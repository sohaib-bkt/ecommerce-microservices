import { defineSchema } from '../validation/schema.js';
import type { Money } from './envelope.js';
import type { EventEnvelope } from './envelope.js';
import { envelopeSchema, moneySchema } from './envelope.js';

/**
 * Events emitted by the product service.
 */

export interface ProductCreatedPayload {
  productId: string;
  sku: string;
  name: string;
  price: Money;
  stockQuantity: number;
  description?: string;
  currency?: string;
  status?: ProductStatus;
  categoryIds?: string[];
  createdAt?: number;
  updatedAt?: number;
}

export interface ProductUpdatedPayload {
  productId: string;
  sku: string;
  name: string;
  description: string;
  price: Money;
  currency: string;
  stockQuantity: number;
  status: ProductStatus;
  categoryIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ProductPriceChangedPayload {
  productId: string;
  previousPrice: Money;
  newPrice: Money;
}

export interface ProductStockChangedPayload {
  productId: string;
  previousQuantity: number;
  newQuantity: number;
  /** Set when the change came from an order rather than a manual adjustment. */
  reservationId?: string;
}

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const productCreatedSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['ProductCreated'] },
  payload: {
    type: 'object',
    fields: {
      productId: { type: 'string', minLength: 1 },
      sku: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1 },
      price: { type: 'object', fields: moneySchema },
      stockQuantity: { type: 'number', integer: true, min: 0 },
      description: { type: 'string', optional: true },
      currency: { type: 'string', minLength: 3, maxLength: 3, optional: true },
      status: { type: 'enum', values: PRODUCT_STATUSES, optional: true },
      categoryIds: { type: 'array', items: { type: 'string', minLength: 1 }, optional: true },
      createdAt: { type: 'number', integer: true, min: 0, optional: true },
      updatedAt: { type: 'number', integer: true, min: 0, optional: true },
    },
  },
});

export const productUpdatedSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['ProductUpdated'] },
  payload: {
    type: 'object',
    fields: {
      productId: { type: 'string', minLength: 1 },
      sku: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1 },
      description: { type: 'string' },
      price: { type: 'object', fields: moneySchema },
      currency: { type: 'string', minLength: 3, maxLength: 3 },
      stockQuantity: { type: 'number', integer: true, min: 0 },
      status: { type: 'enum', values: PRODUCT_STATUSES },
      categoryIds: { type: 'array', items: { type: 'string', minLength: 1 } },
      createdAt: { type: 'number', integer: true, min: 0 },
      updatedAt: { type: 'number', integer: true, min: 0 },
    },
  },
});

export const productPriceChangedSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['ProductPriceChanged'] },
  payload: {
    type: 'object',
    fields: {
      productId: { type: 'string', minLength: 1 },
      previousPrice: { type: 'object', fields: moneySchema },
      newPrice: { type: 'object', fields: moneySchema },
    },
  },
});

export const productStockChangedSchema = defineSchema({
  ...envelopeSchema,
  type: { type: 'enum', values: ['ProductStockChanged'] },
  payload: {
    type: 'object',
    fields: {
      productId: { type: 'string', minLength: 1 },
      previousQuantity: { type: 'number', integer: true, min: 0 },
      newQuantity: { type: 'number', integer: true, min: 0 },
      reservationId: { type: 'string', minLength: 1, optional: true },
    },
  },
});

/** A product service event, ready to be published to the bus. */
export type ProductEvent =
  | EventEnvelope<'ProductCreated', ProductCreatedPayload>
  | EventEnvelope<'ProductUpdated', ProductUpdatedPayload>
  | EventEnvelope<'ProductPriceChanged', ProductPriceChangedPayload>
  | EventEnvelope<'ProductStockChanged', ProductStockChangedPayload>;

/** Schema for the `ProductCreated` event. */
export const PRODUCT_CREATED_EVENT = 'ProductCreated';

/** Schema for the `ProductUpdated` event. */
export const PRODUCT_UPDATED_EVENT = 'ProductUpdated';

/** Schema for the `ProductPriceChanged` event. */
export const PRODUCT_PRICE_CHANGED_EVENT = 'ProductPriceChanged';

/** Schema for the `ProductStockChanged` event. */
export const PRODUCT_STOCK_CHANGED_EVENT = 'ProductStockChanged';
