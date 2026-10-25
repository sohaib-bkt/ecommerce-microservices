import { StripeGateway, StripeGatewayError, type CreatePaymentIntentInput, type PaymentIntentResult } from './stripe.gateway.js';

export class StripeSdkGateway implements StripeGateway {
  constructor(
    private readonly stripe: {
      paymentIntents: {
        create: (
          params: any,
          options?: { idempotencyKey?: string },
        ) => Promise<{ id: string; status: string }>;
      };
    },
  ) {}

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult> {
    try {
      const result = await this.stripe.paymentIntents.create(
        {
          amount: input.amountMinor,
          currency: input.currency.toLowerCase(),
          automatic_payment_methods: { enabled: true },
          metadata: {
            paymentId: input.paymentId,
            orderId: input.orderId,
            eventId: input.eventId,
          },
        },
        { idempotencyKey: input.idempotencyKey },
      );

      return { id: result.id, status: result.status };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Stripe error';
      const retryable =
        error && typeof error === 'object' && 'type' in error &&
        (error.type === 'StripeConnectionError' || error.type === 'StripeRateLimitError');

      throw new StripeGatewayError(message, Boolean(retryable), error);
    }
  }
}
