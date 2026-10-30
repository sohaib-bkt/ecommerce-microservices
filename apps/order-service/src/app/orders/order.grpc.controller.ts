import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ecommerce } from '@ecommerce-platform/contracts';
import { OrderCreationService } from './order-creation.service.js';

@Controller()
export class OrderGrpcController {
  constructor(private readonly orderCreationService: OrderCreationService) {}

  @GrpcMethod('OrderService', 'CreateOrder')
  createOrder(request: ecommerce.order.v1.CreateOrderRequest) {
    return this.orderCreationService.createOrder(request);
  }
}