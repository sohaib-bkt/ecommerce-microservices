import { Injectable } from '@nestjs/common';
import type { StripeEventApplyResult } from './payment.types.js';
import type { PaymentRepository } from './payment.repository.js';

@Injectable()
export class StripeWebhookService {
  constructor(private readonly paymentRepository: PaymentRepository) {}

  async handle(event: any): Promise<StripeEventApplyResult> {
    const eventType = String(event.type ?? '');
    const object = event.data?.object ?? {};
    const paymentIntentId = String(object.id ?? '');

    if (eventType === 'payment_intent.succeeded') {
      return this.paymentRepository.applyStripeEvent({
        eventId: String(event.id),
        eventType,
        paymentIntentId,
        nextStatus: 'CAPTURED',
      });
    }

    if (eventType === 'payment_intent.payment_failed') {
      return this.paymentRepository.applyStripeEvent({
        eventId: String(event.id),
        eventType,
        paymentIntentId,
        nextStatus: 'FAILED',
        failureReason: String(object.last_payment_error?.message ?? 'Payment failed'),
      });
    }

    if (eventType === 'payment_intent.canceled') {
      return this.paymentRepository.applyStripeEvent({
        eventId: String(event.id),
        eventType,
        paymentIntentId,
        nextStatus: 'FAILED',
        failureReason: 'PaymentIntent canceled',
      });
    }

    if (eventType === 'charge.refunded') {
      return this.paymentRepository.applyStripeEvent({
        eventId: String(event.id),
        eventType,
        paymentIntentId,
        nextStatus: null,
      });
    }

    return this.paymentRepository.applyStripeEvent({
      eventId: String(event.id),
      eventType,
      paymentIntentId,
      nextStatus: null,
    });
  }
}
