import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import { ProductController } from './product.controller.js';
import type { ProductClientService } from './product.service.js';

describe('ProductController search', () => {
  it('forwards query and pagination to product-service gRPC', async () => {
    const response = { products: [{ id: 'product_1' }], page: { totalItems: 1 } };
    const client = { searchProducts: jest.fn().mockReturnValue(of(response)) };
    const controller = new ProductController(client as unknown as ProductClientService);

    await expect(controller.searchProducts('  widget ', '2', '5')).resolves.toEqual(response);
    expect(client.searchProducts).toHaveBeenCalledWith({
      query: 'widget',
      page: { page: 2, pageSize: 5 },
    });
  });

  it('rejects empty search queries', async () => {
    const client = { searchProducts: jest.fn() };
    const controller = new ProductController(client as unknown as ProductClientService);

    await expect(controller.searchProducts('  ')).rejects.toBeInstanceOf(BadRequestException);
    expect(client.searchProducts).not.toHaveBeenCalled();
  });
});