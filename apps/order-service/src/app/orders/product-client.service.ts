import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { ecommerce } from '@ecommerce-platform/contracts';
import type { Observable } from 'rxjs';

type ProductGrpcClient = {
  getProduct: (
    request: ecommerce.product.v1.GetProductRequest,
  ) => Observable<ecommerce.product.v1.GetProductResponse>;
  reserveStock: (
    request: ecommerce.product.v1.ReserveStockRequest,
  ) => Observable<ecommerce.product.v1.ReserveStockResponse>;
  releaseStock: (
    request: ecommerce.product.v1.ReleaseStockRequest,
  ) => Observable<ecommerce.product.v1.ReleaseStockResponse>;
};

@Injectable()
export class ProductClientService implements OnModuleInit {
  private productService!: ProductGrpcClient;

  constructor(@Inject('ORDER_PRODUCT_PACKAGE') private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.productService = this.client.getService<ProductGrpcClient>('ProductService');
  }

  getProduct(request: ecommerce.product.v1.GetProductRequest) {
    return this.productService.getProduct(request);
  }

  reserveStock(request: ecommerce.product.v1.ReserveStockRequest) {
    return this.productService.reserveStock(request);
  }

  releaseStock(request: ecommerce.product.v1.ReleaseStockRequest) {
    return this.productService.releaseStock(request);
  }
}