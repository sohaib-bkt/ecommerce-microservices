import { FakeStripeGateway } from './fake-stripe.gateway.js';
import { StripeSdkGateway } from './stripe-sdk.gateway.js';
import { StripeGatewayError } from './stripe.gateway.js';

describe('FakeStripeGateway', () => {
  it('returns the deterministic fake PaymentIntent id', async () => {
    const gateway = new FakeStripeGateway();

    await expect(
      gateway.createPaymentIntent({
        amountMinor: 1500,
        currency: 'USD',
        paymentId: 'pay_123',
        orderId: 'ord_123',
        eventId: 'evt_123',
        idempotencyKey: 'idemp_123',
      }),
    ).resolves.toEqual({
      id: 'pi_fake_pay_123',
      status: 'requires_payment_method',
    });
  });
});

describe('StripeSdkGateway', () => {
  it('sends the exact create payload and idempotency key', async () => {
    const paymentIntents = {
      create: jest.fn().mockResolvedValue({ id: 'pi_123', status: 'requires_payment_method' }),
    };

    const gateway = new StripeSdkGateway({ paymentIntents } as any);
    const result = await gateway.createPaymentIntent({
      amountMinor: 1500,
      currency: 'USD',
      paymentId: 'pay_1',
      orderId: 'ord_1',
      eventId: 'evt_1',
      idempotencyKey: 'idem_1',
    });

    expect(result).toEqual({ id: 'pi_123', status: 'requires_payment_method' });
    expect(paymentIntents.create).toHaveBeenCalledWith(
      {
        amount: 1500,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          paymentId: 'pay_1',
          orderId: 'ord_1',
          eventId: 'evt_1',
        },
      },
      { idempotencyKey: 'idem_1' },
    );
  });

  it('marks connection and rate-limit failures as retryable', async () => {
    const paymentIntents = {
      create: jest.fn().mockRejectedValue({ type: 'StripeConnectionError', message: 'down' }),
    };

    const gateway = new StripeSdkGateway({ paymentIntents } as any);

    await expect(
      gateway.createPaymentIntent({
        amountMinor: 10,
        currency: 'USD',
        paymentId: 'pay_2',
        orderId: 'ord_2',
        eventId: 'evt_2',
        idempotencyKey: 'idem_2',
      }),
    ).rejects.toBeInstanceOf(StripeGatewayError);

    try {
      await gateway.createPaymentIntent({
        amountMinor: 10,
        currency: 'USD',
        paymentId: 'pay_2',
        orderId: 'ord_2',
        eventId: 'evt_2',
        idempotencyKey: 'idem_2',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(StripeGatewayError);
      expect((error as StripeGatewayError).retryable).toBe(true);
    }
  });
});
