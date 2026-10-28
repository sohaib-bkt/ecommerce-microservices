import Stripe from 'stripe';
import { StripeWebhookVerifier } from './stripe-webhook.verifier.js';

describe('StripeWebhookVerifier', () => {
  it('verifies a signed Stripe event payload', () => {
    const stripe = new Stripe('sk_test_fake');
    const config = { getOrThrow: jest.fn().mockReturnValue('whsec_test') } as any;
    const verifier = new StripeWebhookVerifier(stripe, config);
    const payload = JSON.stringify({
      id: 'evt_1',
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', object: 'payment_intent' } },
    });

    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' });
    const verified = verifier.verify(Buffer.from(payload), signature);

    expect(verified.id).toBe('evt_1');
    expect(verified.type).toBe('payment_intent.succeeded');
  });

  it('rejects invalid signatures and tampered payloads', () => {
    const stripe = new Stripe('sk_test_fake');
    const config = { getOrThrow: jest.fn().mockReturnValue('whsec_test') } as any;
    const verifier = new StripeWebhookVerifier(stripe, config);
    const payload = JSON.stringify({
      id: 'evt_1',
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', object: 'payment_intent' } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' });

    expect(() => verifier.verify(Buffer.from(payload), 'bad')).toThrow();
    expect(() => verifier.verify(Buffer.from(payload + 'x'), signature)).toThrow();
  });
});
