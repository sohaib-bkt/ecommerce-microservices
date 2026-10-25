export interface CreatePaymentIntentInput {
  amountMinor: number;
  currency: string;
  paymentId: string;
  orderId: string;
  eventId: string;
  idempotencyKey: string;
}

export interface PaymentIntentResult {
  id: string;
  status: string;
}

export interface StripeGateway {
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult>;
}

export class StripeGatewayError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StripeGatewayError';
  }
}

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');
export const STRIPE_GATEWAY = Symbol('STRIPE_GATEWAY');
