import { BadRequestException } from '@nestjs/common';
import { orderCreatedSchema, parse } from '@ecommerce-platform/contracts';
import { OrdersController } from './orders.controller.js';
import type { OrderEventPublisher } from './order-event.publisher.js';

describe('OrdersController', () => {
  const body = {
    accountId: 'account_123',
    items: [
      {
        productId: 'product_123',
        sku: 'SKU-123',
        name: 'Test item',
        quantity: 2,
        unitPrice: { amount: 1250, currency: 'USD' },
      },
    ],
    total: { amount: 2500, currency: 'USD' },
  };

  it('publishes a valid OrderCreated event and returns its order ID', async () => {
    const publisher = { publishOrderCreated: jest.fn().mockResolvedValue(undefined) };
    const controller = new OrdersController(publisher as unknown as OrderEventPublisher);

    const result = await controller.createOrder({ ...body, orderId: 'client_order_id' } as typeof body);
    const event = publisher.publishOrderCreated.mock.calls[0][0];

    expect(parse(event, orderCreatedSchema)).toEqual(event);
    expect(event.payload.orderId).not.toBe('client_order_id');
    expect(event).toMatchObject({
      type: 'OrderCreated',
      source: 'api-gateway',
      payload: body,
    });
    expect(result).toEqual({
      orderId: event.payload.orderId,
      eventId: event.id,
      status: 'PENDING',
    });
  });

  it('rejects invalid order data without publishing', async () => {
    const publisher = { publishOrderCreated: jest.fn() };
    const controller = new OrdersController(publisher as unknown as OrderEventPublisher);

    await expect(
      controller.createOrder({ ...body, items: [{ ...body.items[0], quantity: 0 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(publisher.publishOrderCreated).not.toHaveBeenCalled();
  });
});