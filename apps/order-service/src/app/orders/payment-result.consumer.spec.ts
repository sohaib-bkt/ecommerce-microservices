import { PaymentResultConsumer } from './payment-result.consumer.js';

describe('PaymentResultConsumer', () => {
  it('drops malformed payment events without calling the order service', async () => {
    const orderStatusService = { applyPaymentCaptured: jest.fn(), applyPaymentFailed: jest.fn() } as any;
    const consumer = new PaymentResultConsumer(orderStatusService);

    await consumer.handlePaymentResult({ type: 'PaymentCaptured' });

    expect(orderStatusService.applyPaymentCaptured).not.toHaveBeenCalled();
    expect(orderStatusService.applyPaymentFailed).not.toHaveBeenCalled();
  });

  it('applies successful captured payment results to the order', async () => {
    const orderStatusService = {
      applyPaymentCaptured: jest.fn(),
      applyPaymentFailed: jest.fn(),
    } as any;
    const consumer = new PaymentResultConsumer(orderStatusService);

    await consumer.handlePaymentResult({
      id: 'evt_1',
      type: 'PaymentCaptured',
      occurredAt: Date.now(),
      source: 'payment-service',
      version: 1,
      payload: {
        paymentId: 'pay_1',
        orderId: 'order_123',
        amount: { amount: 1500, currency: 'USD' },
        providerReference: 'pi_123',
      },
    });

    expect(orderStatusService.applyPaymentCaptured).toHaveBeenCalledWith('order_123', {
      paymentId: 'pay_1',
      providerReference: 'pi_123',
      amount: { amount: 1500, currency: 'USD' },
    });
  });

  it('applies failed payment results to the order', async () => {
    const orderStatusService = {
      applyPaymentCaptured: jest.fn(),
      applyPaymentFailed: jest.fn(),
    } as any;
    const consumer = new PaymentResultConsumer(orderStatusService);

    await consumer.handlePaymentResult({
      id: 'evt_2',
      type: 'PaymentFailed',
      occurredAt: Date.now(),
      source: 'payment-service',
      version: 1,
      payload: {
        paymentId: 'pay_2',
        orderId: 'order_456',
        amount: { amount: 3000, currency: 'USD' },
        reason: 'card declined',
        retryable: false,
      },
    });

    expect(orderStatusService.applyPaymentFailed).toHaveBeenCalledWith('order_456', {
      paymentId: 'pay_2',
      reason: 'card declined',
      retryable: false,
      amount: { amount: 3000, currency: 'USD' },
    });
  });
});
