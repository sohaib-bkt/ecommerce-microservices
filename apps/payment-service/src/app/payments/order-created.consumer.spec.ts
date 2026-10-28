import { OrderCreatedConsumer } from './order-created.consumer.js';

describe('OrderCreatedConsumer', () => {
  it('ignores malformed events without calling the service', async () => {
    const paymentsService = { handleOrderCreated: jest.fn() } as any;
    const consumer = new OrderCreatedConsumer(paymentsService);

    await consumer.handleOrderCreated({ type: 'OrderCreated' });

    expect(paymentsService.handleOrderCreated).not.toHaveBeenCalled();
  });

  it('parses and forwards valid OrderCreated payloads', async () => {
    const paymentsService = { handleOrderCreated: jest.fn().mockResolvedValue(undefined) } as any;
    const consumer = new OrderCreatedConsumer(paymentsService);

    await consumer.handleOrderCreated({
      id: 'evt_1',
      type: 'OrderCreated',
      occurredAt: Date.now(),
      source: 'order-service',
      version: 1,
      payload: {
        orderId: 'order_1',
        accountId: 'acct_1',
        items: [],
        total: { amount: 1500, currency: 'USD' },
      },
    });

    expect(paymentsService.handleOrderCreated).toHaveBeenCalledTimes(1);
    expect(paymentsService.handleOrderCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'evt_1',
        type: 'OrderCreated',
      }),
    );
  });

  it('rethrows retryable service failures so Kafka can retry', async () => {
    const paymentsService = {
      handleOrderCreated: jest.fn().mockRejectedValue(new Error('retry me')),
    } as any;

    const consumer = new OrderCreatedConsumer(paymentsService);

    await expect(consumer.handleOrderCreated({
      id: 'evt_2',
      type: 'OrderCreated',
      occurredAt: Date.now(),
      source: 'order-service',
      version: 1,
      payload: {
        orderId: 'order_2',
        accountId: 'acct_2',
        items: [],
        total: { amount: 2500, currency: 'USD' },
      },
    })).rejects.toThrow('retry me');
  });
});
