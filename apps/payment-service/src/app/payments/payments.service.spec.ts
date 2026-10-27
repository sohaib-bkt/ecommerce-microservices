import { PaymentsService } from './payments.service.js';
import { StripeGatewayError } from './stripe/stripe.gateway.js';

describe('PaymentsService', () => {
  it('creates a PaymentIntent on first delivery', async () => {
    const paymentRepository = {
      findByOrderId: jest.fn().mockResolvedValue(null),
      insertIfAbsent: jest.fn().mockResolvedValue({
        id: 'pay_1',
        orderId: 'order_1',
        accountId: 'acct_1',
        amountMinor: 1999,
        currency: 'USD',
        sourceEventId: 'evt_1',
        providerReference: null,
        status: 'PENDING',
      }),
      setProviderReference: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    } as any;

    const stripeGateway = {
      createPaymentIntent: jest.fn().mockResolvedValue({ id: 'pi_1', status: 'requires_payment_method' }),
    } as any;

    const service = new PaymentsService(paymentRepository, stripeGateway);

    await service.handleOrderCreated({
      id: 'evt_1',
      type: 'OrderCreated',
      payload: {
        orderId: 'order_1',
        accountId: 'acct_1',
        items: [],
        total: { amount: 1999, currency: 'USD' },
      },
    } as any);

    expect(paymentRepository.insertIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order_1',
        accountId: 'acct_1',
        amountMinor: 1999,
        currency: 'USD',
      }),
    );
    expect(stripeGateway.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'pay_1',
        orderId: 'order_1',
        eventId: 'evt_1',
        amountMinor: 1999,
        currency: 'USD',
      }),
    );
    expect(paymentRepository.setProviderReference).toHaveBeenCalledWith('pay_1', 'pi_1');
  });

  it('skips when a payment already has a provider reference', async () => {
    const paymentRepository = {
      findByOrderId: jest.fn().mockResolvedValue({
        id: 'pay_2',
        orderId: 'order_2',
        accountId: 'acct_2',
        amountMinor: 1500,
        currency: 'USD',
        status: 'CAPTURED',
        providerReference: 'pi_2',
      }),
      insertIfAbsent: jest.fn(),
      setProviderReference: jest.fn(),
      updateStatus: jest.fn(),
    } as any;

    const stripeGateway = { createPaymentIntent: jest.fn() } as any;
    const service = new PaymentsService(paymentRepository, stripeGateway);

    await service.handleOrderCreated({
      id: 'evt_2',
      type: 'OrderCreated',
      payload: { orderId: 'order_2', accountId: 'acct_2', items: [], total: { amount: 1500, currency: 'USD' } },
    } as any);

    expect(stripeGateway.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('reuses the same idempotency key for partial success redelivery', async () => {
    const paymentRepository = {
      findByOrderId: jest.fn().mockResolvedValue({
        id: 'pay_3',
        orderId: 'order_3',
        accountId: 'acct_3',
        amountMinor: 3000,
        currency: 'USD',
        sourceEventId: 'evt_3_original',
        status: 'PENDING',
        providerReference: null,
      }),
      insertIfAbsent: jest.fn(),
      setProviderReference: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn(),
    } as any;

    const stripeGateway = {
      createPaymentIntent: jest.fn().mockResolvedValue({ id: 'pi_3', status: 'requires_payment_method' }),
    } as any;

    const service = new PaymentsService(paymentRepository, stripeGateway);

    await service.handleOrderCreated({
      id: 'evt_3',
      type: 'OrderCreated',
      payload: { orderId: 'order_3', accountId: 'acct_3', items: [], total: { amount: 3000, currency: 'USD' } },
    } as any);

    expect(stripeGateway.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'pay_3',
        idempotencyKey: 'pay_3',
        eventId: 'evt_3_original',
      }),
    );
  });

  it('marks zero-amount events as failed without creating a Stripe intent', async () => {
    const paymentRepository = {
      findByOrderId: jest.fn().mockResolvedValue({
        id: 'pay_4',
        orderId: 'order_4',
        accountId: 'acct_4',
        amountMinor: 0,
        currency: 'USD',
        status: 'PENDING',
        providerReference: null,
      }),
      insertIfAbsent: jest.fn(),
      setProviderReference: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    } as any;

    const stripeGateway = { createPaymentIntent: jest.fn() } as any;
    const service = new PaymentsService(paymentRepository, stripeGateway);

    await service.handleOrderCreated({
      id: 'evt_4',
      type: 'OrderCreated',
      payload: { orderId: 'order_4', accountId: 'acct_4', items: [], total: { amount: 0, currency: 'USD' } },
    } as any);

    expect(paymentRepository.updateStatus).toHaveBeenCalledWith('pay_4', 'FAILED', expect.any(String));
    expect(stripeGateway.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('marks non-letter currencies as failed without creating a Stripe intent', async () => {
    const paymentRepository = {
      findByOrderId: jest.fn().mockResolvedValue({
        id: 'pay_5',
        orderId: 'order_5',
        accountId: 'acct_5',
        amountMinor: 100,
        currency: '12$',
        status: 'PENDING',
        providerReference: null,
      }),
      insertIfAbsent: jest.fn(),
      setProviderReference: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    } as any;

    const stripeGateway = { createPaymentIntent: jest.fn() } as any;
    const service = new PaymentsService(paymentRepository, stripeGateway);

    await service.handleOrderCreated({
      id: 'evt_5',
      type: 'OrderCreated',
      payload: { orderId: 'order_5', accountId: 'acct_5', items: [], total: { amount: 100, currency: '12$' } },
    } as any);

    expect(paymentRepository.updateStatus).toHaveBeenCalledWith('pay_5', 'FAILED', expect.any(String));
    expect(stripeGateway.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('propagates retryable Stripe errors and does not persist a provider reference', async () => {
    const paymentRepository = {
      findByOrderId: jest.fn().mockResolvedValue({
        id: 'pay_6',
        orderId: 'order_6',
        accountId: 'acct_6',
        amountMinor: 600,
        currency: 'USD',
        status: 'PENDING',
        providerReference: null,
      }),
      insertIfAbsent: jest.fn(),
      setProviderReference: jest.fn(),
      updateStatus: jest.fn(),
    } as any;

    const stripeGateway = {
      createPaymentIntent: jest.fn().mockRejectedValue(new StripeGatewayError('down', true)),
    } as any;

    const service = new PaymentsService(paymentRepository, stripeGateway);

    await expect(service.handleOrderCreated({
      id: 'evt_6',
      type: 'OrderCreated',
      payload: { orderId: 'order_6', accountId: 'acct_6', items: [], total: { amount: 600, currency: 'USD' } },
    } as any)).rejects.toThrow('down');

    expect(paymentRepository.setProviderReference).not.toHaveBeenCalled();
  });

  it('marks non-retryable Stripe errors as failed', async () => {
    const paymentRepository = {
      findByOrderId: jest.fn().mockResolvedValue({
        id: 'pay_7',
        orderId: 'order_7',
        accountId: 'acct_7',
        amountMinor: 700,
        currency: 'USD',
        status: 'PENDING',
        providerReference: null,
      }),
      insertIfAbsent: jest.fn(),
      setProviderReference: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    } as any;

    const stripeGateway = {
      createPaymentIntent: jest.fn().mockRejectedValue(new StripeGatewayError('bad request', false)),
    } as any;

    const service = new PaymentsService(paymentRepository, stripeGateway);

    await service.handleOrderCreated({
      id: 'evt_7',
      type: 'OrderCreated',
      payload: { orderId: 'order_7', accountId: 'acct_7', items: [], total: { amount: 700, currency: 'USD' } },
    } as any);

    expect(paymentRepository.updateStatus).toHaveBeenCalledWith('pay_7', 'FAILED', 'bad request');
  });
});
