import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { ecommerce } from '@ecommerce-platform/contracts';
import type { Observable } from 'rxjs';

/**
 * Extracts the message type out of a ts-proto message codec (`MessageFns<T>`).
 * The codec is emitted next to every generated interface, so request and
 * response shapes below always come from the .proto files.
 */
type MessageOf<TCodec> = TCodec extends {
  toJSON(message: infer TMessage): unknown;
}
  ? TMessage
  : never;

/**
 * Maps a ts-proto `outputServices=generic-definitions` service definition to
 * the unary, Observable-returning surface exposed by NestJS `ClientGrpc`.
 * Adding, renaming, or removing an RPC in the .proto updates this type
 * automatically - there is no hand-written interface to keep in sync.
 */
export type GrpcUnaryClient<
  TDefinition extends {
    readonly methods: Record<
      string,
      { readonly requestType: unknown; readonly responseType: unknown }
    >;
  },
> = {
  [TMethod in keyof TDefinition['methods']]: (
    request: MessageOf<TDefinition['methods'][TMethod]['requestType']>,
  ) => Observable<MessageOf<TDefinition['methods'][TMethod]['responseType']>>;
};

/** Fully generated gRPC client surface for `ecommerce.product.v1.ProductService`. */
export type ProductGrpcClient = GrpcUnaryClient<
  typeof ecommerce.product.v1.ProductServiceDefinition
>;

@Injectable()
export class ProductClientService implements OnModuleInit {
  private productService!: ProductGrpcClient;

  constructor(@Inject('PRODUCT_PACKAGE') private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.productService =
      this.client.getService<ProductGrpcClient>('ProductService');
  }

  getProduct(request: ecommerce.product.v1.GetProductRequest) {
    return this.productService.getProduct(request);
  }

  listProducts(request: ecommerce.product.v1.ListProductsRequest) {
    return this.productService.listProducts(request);
  }

  searchProducts(request: ecommerce.product.v1.SearchProductsRequest) {
    return this.productService.searchProducts(request);
  }

  createProduct(request: ecommerce.product.v1.CreateProductRequest) {
    return this.productService.createProduct(request);
  }

  updateProduct(request: ecommerce.product.v1.UpdateProductRequest) {
    return this.productService.updateProduct(request);
  }

  reserveStock(request: ecommerce.product.v1.ReserveStockRequest) {
    return this.productService.reserveStock(request);
  }

  releaseStock(request: ecommerce.product.v1.ReleaseStockRequest) {
    return this.productService.releaseStock(request);
  }
}
