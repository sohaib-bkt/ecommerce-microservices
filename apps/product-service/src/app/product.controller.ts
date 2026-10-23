import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ecommerce } from '@ecommerce-platform/contracts';
import { ProductService } from './product.service.js';

type CreateProductRequest = ecommerce.product.v1.CreateProductRequest;
type CreateProductResponse = ecommerce.product.v1.CreateProductResponse;
type GetProductRequest = ecommerce.product.v1.GetProductRequest;
type GetProductResponse = ecommerce.product.v1.GetProductResponse;
type ListProductsRequest = ecommerce.product.v1.ListProductsRequest;
type ListProductsResponse = ecommerce.product.v1.ListProductsResponse;
type ProductStatus = ecommerce.product.v1.ProductStatus;
type ReserveStockRequest = ecommerce.product.v1.ReserveStockRequest;
type ReserveStockResponse = ecommerce.product.v1.ReserveStockResponse;
type ReleaseStockRequest = ecommerce.product.v1.ReleaseStockRequest;
type ReleaseStockResponse = ecommerce.product.v1.ReleaseStockResponse;
type UpdateProductRequest = ecommerce.product.v1.UpdateProductRequest;
type UpdateProductResponse = ecommerce.product.v1.UpdateProductResponse;

@Controller()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @GrpcMethod('ProductService', 'GetProduct')
  getProduct(request: GetProductRequest): GetProductResponse {
    const product = this.productService.findById(request.id);
    if (!product) {
      throw new Error(`Product not found: ${request.id}`);
    }
    return { product: toProto(product) };
  }

  @GrpcMethod('ProductService', 'ListProducts')
  listProducts(request: ListProductsRequest): ListProductsResponse {
    const { products, totalItems } = this.productService.list(
      request.page?.pageSize ?? 0,
      request.categoryId ?? '',
      (request.status ?? 0) as ProductStatus,
    );
    return {
      products: products.map(toProto),
      page: {
        totalItems,
        totalPages:
          request.page?.pageSize && request.page.pageSize > 0
            ? Math.ceil(totalItems / request.page.pageSize)
            : 1,
        currentPage: request.page?.page ?? 1,
      },
    };
  }

  @GrpcMethod('ProductService', 'CreateProduct')
  createProduct(request: CreateProductRequest): CreateProductResponse {
    const product = this.productService.create(request);
    return { product: toProto(product) };
  }

  @GrpcMethod('ProductService', 'UpdateProduct')
  updateProduct(request: UpdateProductRequest): UpdateProductResponse {
    const product = this.productService.update(request);
    if (!product) {
      throw new Error(`Product not found: ${request.id}`);
    }
    return { product: toProto(product) };
  }

  @GrpcMethod('ProductService', 'ReserveStock')
  reserveStock(request: ReserveStockRequest): ReserveStockResponse {
    return this.productService.reserve(request);
  }

  @GrpcMethod('ProductService', 'ReleaseStock')
  releaseStock(request: ReleaseStockRequest): ReleaseStockResponse {
    return this.productService.release(request);
  }
}

function toProto(product: {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: { currency: string; amount: number };
  currency: string;
  stockQuantity: number;
  status: ProductStatus;
  categoryIds: string[];
  createdAt: { epochMillis: number };
  updatedAt: { epochMillis: number };
}): ecommerce.product.v1.Product {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    price: product.price,
    currency: product.currency,
    stockQuantity: product.stockQuantity,
    status: product.status,
    categoryIds: product.categoryIds,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
