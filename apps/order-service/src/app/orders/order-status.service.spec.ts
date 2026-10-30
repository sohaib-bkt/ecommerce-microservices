import { OrderStatusService } from './order-status.service.js';
import type { OrderStatusRepository } from './order-status.repository.js';

describe('OrderStatusService', () => {
  function makeRepo() {
    const store = new Map<string, any>();
    return {
      getByOrderId: async (id: string) => store.get(id),
      applyPaymentCaptured: async (orderId: string, payload: any) => {
        const current = store.get(orderId);
        if (current?.status === 'PAID') return current;
        const next = {
          orderId,
          status: 'PAID',
          paymentId: payload.paymentId,
          providerReference: payload.providerReference,
          amount: payload.amount,
        };
        store.set(orderId, next);
        return next;
      },
      applyPaymentFailed: async (orderId: string, payload: any) => {
        const current = store.get(orderId);
        if (current?.status === 'PENDING' && current.paymentId === payload.paymentId) {
          return current;
        }
        const next = {
          orderId,
          status: 'PENDING',
          reason: payload.reason,
          paymentId: payload.paymentId,
          amount: payload.amount,
          providerReference: undefined,
        };
        store.set(orderId, next);
        return next;
      },
      isAlreadyProcessed: async (orderId: string, status: string, paymentId?: string) => {
        const current = store.get(orderId);
        return current?.status === status && (paymentId === undefined || current.paymentId === paymentId);
      },
    } as unknown as OrderStatusRepository;
  }

  it('marks the order as paid when a capture event arrives', async () => {
    const service = new OrderStatusService(makeRepo());

    await service.applyPaymentCaptured('order_1', {
      paymentId: 'pay_1',
      providerReference: 'pi_1',
      amount: { amount: 1500, currency: 'USD' },
    });

    expect(await service.getStatus('order_1')).toEqual({
      orderId: 'order_1',
      status: 'PAID',
      reason: undefined,
      paymentId: 'pay_1',
      providerReference: 'pi_1',
      amount: { amount: 1500, currency: 'USD' },
    });
  });

  it('marks the order as pending when a payment failure arrives', async () => {
    const service = new OrderStatusService(makeRepo());

    await service.applyPaymentFailed('order_2', {
      paymentId: 'pay_2',
      reason: 'card declined',
      retryable: false,
      amount: { amount: 500, currency: 'USD' },
    });

    expect(await service.getStatus('order_2')).toEqual({
      orderId: 'order_2',
      status: 'PENDING',
      reason: 'card declined',
      paymentId: 'pay_2',
      amount: { amount: 500, currency: 'USD' },
      providerReference: undefined,
    });
  });
});