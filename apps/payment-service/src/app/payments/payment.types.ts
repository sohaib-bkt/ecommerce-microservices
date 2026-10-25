import type { EventEnvelope, OrderCreatedPayload, PaymentStatus } from '@ecommerce-platform/contracts';

export type OrderCreatedEvent = EventEnvelope<'OrderCreated', OrderCreatedPayload>;

export interface PaymentRecord {
  id: string;
  orderId: string;
  accountId: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  methodType: string;
  provider: string;
  providerReference: string | null;
  failureReason: string | null;
  sourceEventId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentInput {
  id: string;
  orderId: string;
  accountId: string;
  amountMinor: number;
  currency: string;
  sourceEventId: string;
}

export interface StripeEventUpdate {
  eventId: string;
  eventType: string;
  paymentIntentId: string;
  nextStatus: PaymentStatus | null;
  failureReason?: string;
}

export type StripeEventApplyResult =
  | 'applied'
  | 'duplicate'
  | 'ignored'
  | 'not_found';
