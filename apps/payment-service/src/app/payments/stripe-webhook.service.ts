import { Injectable } from '@nestjs/common';
import type { StripeEventApplyResult } from './payment.types.js';
import { PaymentRepository } from './payment.repository.js';
import { PaymentResultPublisher } from './payment-result.publisher.js';

@Injectable()
export class StripeWebhookService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly paymentResultPublisher: PaymentResultPublisher,
  ) {}

  async handle(event: any): Promise<StripeEventApplyResult> {
    const eventType = String(event.type ?? '');
    const object = event.data?.object ?? {};
    const paymentIntentId = String(object.id ?? '');

    let result: StripeEventApplyResult;

    if (eventType === 'payment_intent.succeeded') {
      result = await this.paymentRepository.applyStripeEvent({
        eventId: String(event.id),
        eventType,
        paymentIntentId,
        nextStatus: 'CAPTURED',
      });
    } else if (eventType === 'payment_intent.payment_failed') {
      result = await this.paymentRepository.applyStripeEvent({
        eventId: String(event.id),
        eventType,
        paymentIntentId,
        nextStatus: 'FAILED',
        failureReason: String(object.last_payment_error?.message ?? 'Payment failed'),
      });
    } else if (eventType === 'payment_intent.canceled') {
      result = await this.paymentRepository.applyStripeEvent({
        eventId: String(event.id),
        eventType,
        paymentIntentId,
        nextStatus: 'FAILED',
        failureReason: 'PaymentIntent canceled',
      });
    } else if (eventType === 'charge.refunded') {
      result = await this.paymentRepository.applyStripeEvent({
        eventId: String(event.id),
        eventType,
        paymentIntentId,
        nextStatus: null,
      });
    } else {
      result = await this.paymentRepository.applyStripeEvent({
        eventId: String(event.id),
        eventType,
        paymentIntentId,
        nextStatus: null,
      });
    }

    if (result !== 'applied' && result !== 'duplicate') {
      return result;
    }

    const payment = await this.paymentRepository.findByProviderReference(paymentIntentId);
    if (!payment) {
      return result;
    }

    if (eventType === 'payment_intent.succeeded' && payment.status === 'CAPTURED') {
      await this.paymentResultPublisher.publishCaptured({
        paymentId: payment.id,
        orderId: payment.orderId,
        amount: { amount: payment.amountMinor, currency: payment.currency },
        providerReference: paymentIntentId,
      });
      return result;
    }

    if (
      (eventType === 'payment_intent.payment_failed' || eventType === 'payment_intent.canceled') &&
      payment.status === 'FAILED'
    ) {
      await this.paymentResultPublisher.publishFailed({
        paymentId: payment.id,
        orderId: payment.orderId,
        amount: { amount: payment.amountMinor, currency: payment.currency },
        reason:
          eventType === 'payment_intent.canceled'
            ? 'PaymentIntent canceled'
            : String(object.last_payment_error?.message ?? 'Payment failed'),
        retryable: false,
      });
    }

    return result;
  }
}
