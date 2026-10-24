import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ecommerce } from '@ecommerce-platform/contracts';
import { firstValueFrom } from 'rxjs';
import { ProductClientService } from './product.service.js';

/**
 * REST bodies are derived from the generated protobuf messages, so a change in
 * the .proto surfaces here as a compile error instead of drifting silently.
 */
type CreateProductBody = Omit<
  ecommerce.product.v1.CreateProductRequest,
  'categoryIds'
> & { categoryIds?: ecommerce.product.v1.CreateProductRequest['categoryIds'] };

type UpdateProductBody = Partial<
  Omit<ecommerce.product.v1.UpdateProductRequest, 'id'>
>;

type ReserveStockBody = Pick<
  ecommerce.product.v1.ReserveStockRequest,
  'quantity' | 'reservationId'
>;

type ReleaseStockBody = Pick<
  ecommerce.product.v1.ReleaseStockRequest,
  'quantity' | 'reservationId'
>;

@Controller('products')
export class ProductController {
  constructor(private readonly productClient: ProductClientService) {}

  @Get(':id')
  async getProduct(@Param('id') id: string) {
    return firstValueFrom(this.productClient.getProduct({ id }));
  }

  @Get()
  async listProducts(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: string,
  ) {
    return firstValueFrom(
      this.productClient.listProducts({
        page: { page: Number(page ?? 1), pageSize: Number(pageSize ?? 10) },
        categoryId: categoryId ?? '',
        status: status
          ? (Number(status) as ecommerce.product.v1.ProductStatus)
          : ecommerce.product.v1.ProductStatus.PRODUCT_STATUS_UNSPECIFIED,
      }),
    );
  }

  @Post()
  async createProduct(@Body() body: CreateProductBody) {
    return firstValueFrom(
      this.productClient.createProduct({
        ...body,
        categoryIds: body.categoryIds ?? [],
      }),
    );
  }

  @Put(':id')
  async updateProduct(
    @Param('id') id: string,
    @Body() body: UpdateProductBody,
  ) {
    return firstValueFrom(
      this.productClient.updateProduct({
        id,
        name: body.name ?? '',
        description: body.description ?? '',
        price: body.price,
        status:
          body.status ??
          ecommerce.product.v1.ProductStatus.PRODUCT_STATUS_UNSPECIFIED,
      }),
    );
  }

  @Post(':id/reserve-stock')
  async reserveStock(@Param('id') id: string, @Body() body: ReserveStockBody) {
    return firstValueFrom(
      this.productClient.reserveStock({
        productId: id,
        quantity: body.quantity,
        reservationId: body.reservationId,
      }),
    );
  }

  @Post(':id/release-stock')
  async releaseStock(@Param('id') id: string, @Body() body: ReleaseStockBody) {
    return firstValueFrom(
      this.productClient.releaseStock({
        productId: id,
        quantity: body.quantity,
        reservationId: body.reservationId,
      }),
    );
  }
}
