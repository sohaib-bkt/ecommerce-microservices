import { RpcException } from '@nestjs/microservices';
import { ecommerce } from '@ecommerce-platform/contracts';
import { of } from 'rxjs';
import { OrderCreationService } from './order-creation.service.js';
import type { OrderOutboxPublisher } from './order-outbox.publisher.js';
import type { OrderRepository } from './order.repository.js';
import type { ProductClientService } from './product-client.service.js';

const product = (id: string, amount: number) => ({
  id,
  sku: `SKU-${id}`,
  name: `Product ${id}`,
  price: { amount, currency: 'USD' },
  currency: 'USD',
  status: ecommerce.product.v1.ProductStatus.PRODUCT_STATUS_ACTIVE,
});

describe('OrderCreationService', () => {
  it('uses product-service prices, reserves stock, persists the order and outbox event', async () => {
    const productClient = {
      getProduct: jest.fn().mockReturnValue(of({ product: product('p1', 1250) })),
      reserveStock: jest.fn().mockReturnValue(of({ fulfilled: true })),
      releaseStock: jest.fn(),
    };
    const repository = { createWithOutbox: jest.fn().mockResolvedValue(undefined) };
    const publisher = { flushPending: jest.fn().mockResolvedValue(undefined) };
    const service = new OrderCreationService(
      productClient as unknown as ProductClientService,
      repository as unknown as OrderRepository,
      publisher as unknown as OrderOutboxPublisher,
    );

    const result = await service.createOrder({
      accountId: 'account_1',
      items: [{ productId: 'p1', quantity: 2 }],
    });

    expect(result.order.total).toEqual({ amount: 2500, currency: 'USD' });
    expect(result.order.items).toEqual([
      {
        productId: 'p1',
        sku: 'SKU-p1',
        name: 'Product p1',
        quantity: 2,
        unitPrice: { amount: 1250, currency: 'USD' },
      },
    ]);
    expect(productClient.reserveStock).toHaveBeenCalledWith({
      productId: 'p1',
      quantity: 2,
      reservationId: `${result.order.id}:p1`,
    });
    expect(repository.createWithOutbox).toHaveBeenCalledWith(
      result.order,
      expect.objectContaining({ type: 'OrderCreated', source: 'order-service' }),
    );
    expect(publisher.flushPending).toHaveBeenCalled();
  });

  it('releases earlier reservations if a later item cannot be reserved', async () => {
    const productClient = {
      getProduct: jest
        .fn()
        .mockReturnValueOnce(of({ product: product('p1', 1250) }))
        .mockReturnValueOnce(of({ product: product('p2', 500) })),
      reserveStock: jest
        .fn()
        .mockReturnValueOnce(of({ fulfilled: true }))
        .mockReturnValueOnce(of({ fulfilled: false })),
      releaseStock: jest.fn().mockReturnValue(of({ remainingStock: 1 })),
    };
    const repository = { createWithOutbox: jest.fn() };
    const publisher = { flushPending: jest.fn() };
    const service = new OrderCreationService(
      productClient as unknown as ProductClientService,
      repository as unknown as OrderRepository,
      publisher as unknown as OrderOutboxPublisher,
    );

    await expect(
      service.createOrder({
        accountId: 'account_1',
        items: [
          { productId: 'p1', quantity: 1 },
          { productId: 'p2', quantity: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(RpcException);

    expect(productClient.releaseStock).toHaveBeenCalledWith({
      productId: 'p1',
      quantity: 1,
      reservationId: expect.stringMatching(/:p1$/),
    });
    expect(repository.createWithOutbox).not.toHaveBeenCalled();
  });
});