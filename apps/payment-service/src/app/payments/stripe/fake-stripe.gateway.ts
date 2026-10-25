import {
  StripeGateway,
  type CreatePaymentIntentInput,
  type PaymentIntentResult,
} from './stripe.gateway.js';

export class FakeStripeGateway implements StripeGateway {
  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult> {
    return {
      id: `pi_fake_${input.paymentId}`,
      status: 'requires_payment_method',
    };
  }
}
