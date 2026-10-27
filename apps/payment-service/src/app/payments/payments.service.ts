import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { STRIPE_GATEWAY, StripeGatewayError } from './stripe/stripe.gateway.js';
import type { StripeGateway } from './stripe/stripe.gateway.js';
import type { OrderCreatedEvent } from './payment.types.js';
import { PaymentRepository } from './payment.repository.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    @Inject(STRIPE_GATEWAY) private readonly stripeGateway: StripeGateway,
  ) {}

  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    const { orderId, accountId, total } = event.payload;
    const amountMinor = Number(total.amount ?? 0);
    const currency = String(total.currency ?? '');

    let payment = await this.paymentRepository.findByOrderId(orderId);

    if (!payment) {
      const inserted = await this.paymentRepository.insertIfAbsent({
        id: randomUUID(),
        orderId,
        accountId,
        amountMinor,
        currency,
        sourceEventId: event.id,
      });

      payment = inserted ?? (await this.paymentRepository.findByOrderId(orderId));
    }

    if (!payment) {
      return;
    }

    if (payment.status === 'FAILED') {
      return;
    }

    if (payment.providerReference) {
      return;
    }

    if (payment.amountMinor === 0 || !/^[A-Z]{3}$/i.test(payment.currency)) {
      await this.paymentRepository.updateStatus(
        payment.id,
        'FAILED',
        `Invalid payment payload: amount=${payment.amountMinor}, currency=${payment.currency}`,
      );
      return;
    }

    try {
      const paymentIntent = await this.stripeGateway.createPaymentIntent({
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paymentId: payment.id,
        orderId: payment.orderId,
        eventId: payment.sourceEventId,
        idempotencyKey: payment.id,
      });

      await this.paymentRepository.setProviderReference(payment.id, paymentIntent.id);
    } catch (error) {
      if (error instanceof StripeGatewayError && !error.retryable) {
        await this.paymentRepository.updateStatus(payment.id, 'FAILED', error.message);
        return;
      }

      throw error;
    }
  }
}
