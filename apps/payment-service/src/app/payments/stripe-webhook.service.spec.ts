import { StripeWebhookService } from './stripe-webhook.service.js';

describe('StripeWebhookService', () => {
  it('maps payment_intent.succeeded to CAPTURED', async () => {
    const payment = {
      id: 'pay_1',
      orderId: 'order_1',
      amountMinor: 1500,
      currency: 'USD',
      status: 'CAPTURED',
    };
    const repo = {
      applyStripeEvent: jest.fn().mockResolvedValue('applied'),
      findByProviderReference: jest.fn().mockResolvedValue(payment),
    } as any;
    const publisher = { publishCaptured: jest.fn(), publishFailed: jest.fn() } as any;
    const service = new StripeWebhookService(repo, publisher);

    const result = await service.handle({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', object: 'payment_intent' } },
    } as any);

    expect(result).toBe('applied');
    expect(repo.applyStripeEvent).toHaveBeenCalledWith({
      eventId: 'evt_1',
      eventType: 'payment_intent.succeeded',
      paymentIntentId: 'pi_1',
      nextStatus: 'CAPTURED',
    });
    expect(publisher.publishCaptured).toHaveBeenCalledWith({
      paymentId: 'pay_1',
      orderId: 'order_1',
      amount: { amount: 1500, currency: 'USD' },
      providerReference: 'pi_1',
    });
  });

  it('maps payment_intent.payment_failed to FAILED', async () => {
    const payment = {
      id: 'pay_2',
      orderId: 'order_2',
      amountMinor: 3000,
      currency: 'USD',
      status: 'FAILED',
    };
    const repo = {
      applyStripeEvent: jest.fn().mockResolvedValue('applied'),
      findByProviderReference: jest.fn().mockResolvedValue(payment),
    } as any;
    const publisher = { publishCaptured: jest.fn(), publishFailed: jest.fn() } as any;
    const service = new StripeWebhookService(repo, publisher);

    await service.handle({
      id: 'evt_2',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_2',
          object: 'payment_intent',
          last_payment_error: { message: 'card declined' },
        },
      },
    } as any);

    expect(repo.applyStripeEvent).toHaveBeenCalledWith({
      eventId: 'evt_2',
      eventType: 'payment_intent.payment_failed',
      paymentIntentId: 'pi_2',
      nextStatus: 'FAILED',
      failureReason: 'card declined',
    });
    expect(publisher.publishFailed).toHaveBeenCalledWith({
      paymentId: 'pay_2',
      orderId: 'order_2',
      amount: { amount: 3000, currency: 'USD' },
      reason: 'card declined',
      retryable: false,
    });
  });

  it('maps canceled intents to FAILED and ignores refunds', async () => {
    const repo = {
      applyStripeEvent: jest.fn().mockResolvedValue('ignored'),
      findByProviderReference: jest.fn(),
    } as any;
    const publisher = { publishCaptured: jest.fn(), publishFailed: jest.fn() } as any;
    const service = new StripeWebhookService(repo, publisher);

    await service.handle({
      id: 'evt_3',
      type: 'payment_intent.canceled',
      data: { object: { id: 'pi_3', object: 'payment_intent' } },
    } as any);

    expect(repo.applyStripeEvent).toHaveBeenCalledWith({
      eventId: 'evt_3',
      eventType: 'payment_intent.canceled',
      paymentIntentId: 'pi_3',
      nextStatus: 'FAILED',
      failureReason: 'PaymentIntent canceled',
    });

    await service.handle({
      id: 'evt_4',
      type: 'charge.refunded',
      data: { object: { id: 'ch_4', object: 'charge' } },
    } as any);

    expect(repo.applyStripeEvent).toHaveBeenLastCalledWith({
      eventId: 'evt_4',
      eventType: 'charge.refunded',
      paymentIntentId: 'ch_4',
      nextStatus: null,
    });
    expect(repo.findByProviderReference).not.toHaveBeenCalled();
  });

  it('re-publishes an applied result when Stripe retries a duplicate webhook', async () => {
    const payment = {
      id: 'pay_1',
      orderId: 'order_1',
      amountMinor: 1500,
      currency: 'USD',
      status: 'CAPTURED',
    };
    const repo = {
      applyStripeEvent: jest.fn().mockResolvedValue('duplicate'),
      findByProviderReference: jest.fn().mockResolvedValue(payment),
    } as any;
    const publisher = { publishCaptured: jest.fn(), publishFailed: jest.fn() } as any;
    const service = new StripeWebhookService(repo, publisher);

    const result = await service.handle({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', object: 'payment_intent' } },
    } as any);

    expect(result).toBe('duplicate');
    expect(publisher.publishCaptured).toHaveBeenCalledWith({
      paymentId: 'pay_1',
      orderId: 'order_1',
      amount: { amount: 1500, currency: 'USD' },
      providerReference: 'pi_1',
    });
  });
});
