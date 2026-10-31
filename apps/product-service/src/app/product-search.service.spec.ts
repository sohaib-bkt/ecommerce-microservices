import { ecommerce } from '@ecommerce-platform/contracts';
import type { Client } from '@elastic/elasticsearch';
import { ProductSearchService } from './product-search.service.js';
import type { ProductService, StoredProduct } from './product.service.js';

const product: StoredProduct = {
  id: 'product_1',
  sku: 'SKU-1',
  name: 'Widget',
  description: 'Useful widget',
  price: { currency: 'USD', amount: 1999 },
  currency: 'USD',
  stockQuantity: 4,
  status: ecommerce.product.v1.ProductStatus.PRODUCT_STATUS_ACTIVE,
  categoryIds: ['tools'],
  createdAt: { epochMillis: 100 },
  updatedAt: { epochMillis: 200 },
};

describe('ProductSearchService', () => {
  function makeClient() {
    return {
      indices: {
        exists: jest.fn().mockResolvedValue(true),
        create: jest.fn(),
      },
      index: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue({
        hits: {
          total: { value: 1 },
          hits: [{ _source: {
            id: product.id,
            sku: product.sku,
            name: product.name,
            description: product.description,
            price: product.price,
            currency: product.currency,
            stockQuantity: product.stockQuantity,
            status: product.status,
            categoryIds: product.categoryIds,
            createdAt: 100,
            updatedAt: 200,
          } }],
        },
      }),
    };
  }

  it('indexes a complete product document with its product ID', async () => {
    const client = makeClient();
    const service = new ProductSearchService(client as unknown as Client, {} as ProductService);

    await service.indexProduct(product);

    expect(client.index).toHaveBeenCalledWith({
      index: 'products',
      id: 'product_1',
      document: expect.objectContaining({
        name: 'Widget',
        sku: 'SKU-1',
        description: 'Useful widget',
        stockQuantity: 4,
        status: ecommerce.product.v1.ProductStatus.PRODUCT_STATUS_ACTIVE,
      }),
      refresh: 'wait_for',
    });
  });

  it('searches active products and maps Elasticsearch hits to proto products', async () => {
    const client = makeClient();
    const service = new ProductSearchService(client as unknown as Client, {} as ProductService);

    const result = await service.searchProducts('widget', 2, 5);

    expect(client.search).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 5,
        size: 5,
        query: expect.objectContaining({
          bool: expect.objectContaining({
            must: [expect.objectContaining({ multi_match: expect.objectContaining({ query: 'widget' }) })],
          }),
        }),
      }),
    );
    expect(result.products[0]).toMatchObject({
      id: 'product_1',
      name: 'Widget',
      status: ecommerce.product.v1.ProductStatus.PRODUCT_STATUS_ACTIVE,
      createdAt: { epochMillis: 100 },
    });
    expect(result.page).toEqual({ totalItems: 1, totalPages: 1, currentPage: 2 });
  });
});