import { BadRequestException, ConflictException } from '@nestjs/common';
import { ecommerce } from '@ecommerce-platform/contracts';
import { of, throwError } from 'rxjs';
import { OrdersController } from './orders.controller.js';
import type { OrderClientService } from './order-client.service.js';

describe('OrdersController', () => {
  const body: ecommerce.order.v1.CreateOrderRequest = {
    accountId: 'account_123',
    items: [{ productId: 'product_123', quantity: 2 }],
  };

  it('proxies order creation to order-service over gRPC', async () => {
    const order = {
      id: 'order_123',
      accountId: 'account_123',
      status: ecommerce.order.v1.OrderStatus.ORDER_STATUS_PENDING,
      items: [],
      total: { amount: 2500, currency: 'USD' },
      currency: 'USD',
      paymentId: '',
    };
    const client = { createOrder: jest.fn().mockReturnValue(of({ order })) };
    const controller = new OrdersController(client as unknown as OrderClientService);

    await expect(controller.createOrder(body)).resolves.toEqual(order);
    expect(client.createOrder).toHaveBeenCalledWith(body);
  });

  it('maps gRPC validation and stock errors to HTTP errors', async () => {
    const client = {
      createOrder: jest
        .fn()
        .mockReturnValueOnce(throwError(() => ({ code: 3, details: 'bad request' })))
        .mockReturnValueOnce(throwError(() => ({ code: 9, details: 'out of stock' }))),
    };
    const controller = new OrdersController(client as unknown as OrderClientService);

    await expect(controller.createOrder(body)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.createOrder(body)).rejects.toBeInstanceOf(ConflictException);
  });
});