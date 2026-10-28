import { Inject, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from './stripe.gateway.js';

export type StripeConfigLike = {
  getOrThrow: (key: string) => string;
};

@Injectable()
export class StripeWebhookVerifier {
  private readonly secret: string;

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    config: StripeConfigLike,
  ) {
    this.secret = config.getOrThrow('STRIPE_WEBHOOK_SECRET');
  }

  verify(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, this.secret);
  }
}
