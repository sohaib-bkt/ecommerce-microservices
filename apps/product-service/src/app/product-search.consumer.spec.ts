import { ProductSearchConsumer } from './product-search.consumer.js';
import type { ProductSearchService } from './product-search.service.js';

describe('ProductSearchConsumer', () => {
  it('indexes ProductCreated snapshots', async () => {
    const search = { indexProduct: jest.fn().mockResolvedValue(undefined) };
    const consumer = new ProductSearchConsumer(search as unknown as ProductSearchService);

    await consumer.handleCreated({
      id: 'evt_1',
      type: 'ProductCreated',
      occurredAt: 100,
      source: 'product-service',
      version: 1,
      payload: {
        productId: 'product_1',
        sku: 'SKU-1',
        name: 'Widget',
        description: 'Useful widget',
        price: { amount: 1999, currency: 'USD' },
        currency: 'USD',
        stockQuantity: 4,
        status: 'ACTIVE',
        categoryIds: ['tools'],
        createdAt: 10,
        updatedAt: 100,
      },
    });

    expect(search.indexProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'product_1',
        name: 'Widget',
        status: 2,
      }),
    );
  });

  it('indexes ProductUpdated snapshots and drops malformed events', async () => {
    const search = { indexProduct: jest.fn().mockResolvedValue(undefined) };
    const consumer = new ProductSearchConsumer(search as unknown as ProductSearchService);

    await consumer.handleUpdated({
      id: 'evt_2',
      type: 'ProductUpdated',
      occurredAt: 200,
      source: 'product-service',
      version: 1,
      payload: {
        productId: 'product_1',
        sku: 'SKU-1',
        name: 'Updated widget',
        description: 'Updated description',
        price: { amount: 2500, currency: 'USD' },
        currency: 'USD',
        stockQuantity: 3,
        status: 'ACTIVE',
        categoryIds: ['tools'],
        createdAt: 10,
        updatedAt: 200,
      },
    });
    await consumer.handleUpdated({ type: 'ProductUpdated' });

    expect(search.indexProduct).toHaveBeenCalledTimes(1);
    expect(search.indexProduct).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'product_1', name: 'Updated widget', stockQuantity: 3 }),
    );
  });
});