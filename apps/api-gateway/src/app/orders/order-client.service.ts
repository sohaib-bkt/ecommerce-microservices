import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { ecommerce } from '@ecommerce-platform/contracts';
import type { Observable } from 'rxjs';

type OrderGrpcClient = {
  createOrder: (
    request: ecommerce.order.v1.CreateOrderRequest,
  ) => Observable<ecommerce.order.v1.CreateOrderResponse>;
};

@Injectable()
export class OrderClientService implements OnModuleInit {
  private orderService!: OrderGrpcClient;

  constructor(@Inject('ORDER_PACKAGE') private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.orderService = this.client.getService<OrderGrpcClient>('OrderService');
  }

  createOrder(request: ecommerce.order.v1.CreateOrderRequest) {
    return this.orderService.createOrder(request);
  }
}