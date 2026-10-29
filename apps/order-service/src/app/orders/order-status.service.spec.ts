import { OrderStatusService } from './order-status.service.js';

describe('OrderStatusService', () => {
  it('marks the order as paid when a capture event arrives', () => {
    const service = new OrderStatusService();

    service.applyPaymentCaptured('order_1', {
      paymentId: 'pay_1',
      providerReference: 'pi_1',
      amount: { amount: 1500, currency: 'USD' },
    });

    expect(service.getStatus('order_1')).toEqual({
      orderId: 'order_1',
      status: 'PAID',
      reason: undefined,
      paymentId: 'pay_1',
      providerReference: 'pi_1',
      amount: { amount: 1500, currency: 'USD' },
    });
  });

  it('marks the order as pending when a payment failure arrives', () => {
    const service = new OrderStatusService();

    service.applyPaymentFailed('order_2', {
      paymentId: 'pay_2',
      reason: 'card declined',
      retryable: false,
      amount: { amount: 500, currency: 'USD' },
    });

    expect(service.getStatus('order_2')).toEqual({
      orderId: 'order_2',
      status: 'PENDING',
      reason: 'card declined',
      paymentId: 'pay_2',
      providerReference: undefined,
      amount: { amount: 500, currency: 'USD' },
    });
    expect(service.isAlreadyProcessed('order_2', 'PENDING', 'pay_2')).toBe(true);
    expect(service.isAlreadyProcessed('order_2', 'PENDING', 'pay_3')).toBe(false);
  });
});
