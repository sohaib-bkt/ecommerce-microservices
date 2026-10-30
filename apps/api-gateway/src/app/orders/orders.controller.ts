import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  InternalServerErrorException,
  NotFoundException,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ecommerce } from '@ecommerce-platform/contracts';
import { firstValueFrom } from 'rxjs';
import { OrderClientService } from './order-client.service.js';

type CreateOrderBody = ecommerce.order.v1.CreateOrderRequest;

@Controller('orders')
export class OrdersController {
  constructor(private readonly orderClient: OrderClientService) {}

  @Post()
  async createOrder(@Body() body: CreateOrderBody) {
    try {
      const response = await firstValueFrom(this.orderClient.createOrder(body));
      if (!response.order) {
        throw new BadGatewayException('Order service returned an empty order response');
      }
      return response.order;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof ServiceUnavailableException ||
        error instanceof BadGatewayException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      const grpcError = error as { code?: number; details?: string; message?: string };
      const message = grpcError.details ?? grpcError.message ?? 'Order service request failed';
      switch (grpcError.code) {
        case 3:
          throw new BadRequestException(message);
        case 5:
          throw new NotFoundException(message);
        case 9:
          throw new ConflictException(message);
        case 14:
          throw new ServiceUnavailableException(message);
        case undefined:
          throw new ServiceUnavailableException(message);
        default:
          throw new InternalServerErrorException(message);
      }
    }
  }
}