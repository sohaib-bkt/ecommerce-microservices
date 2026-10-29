import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  orderCreatedSchema,
  parse,
  SchemaValidationError,
} from '@ecommerce-platform/contracts';
import type { EventEnvelope, OrderCreatedPayload } from '@ecommerce-platform/contracts';
import { OrderEventPublisher } from './order-event.publisher.js';

type CreateOrderBody = Omit<OrderCreatedPayload, 'orderId'>;
type OrderCreatedEvent = EventEnvelope<'OrderCreated', OrderCreatedPayload>;

@Controller('orders')
export class OrdersController {
  constructor(private readonly orderEventPublisher: OrderEventPublisher) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async createOrder(@Body() body: CreateOrderBody) {
    const event: OrderCreatedEvent = {
      id: `evt_${randomUUID()}`,
      type: 'OrderCreated',
      occurredAt: Date.now(),
      source: 'api-gateway',
      version: 1,
      payload: {
        ...body,
        orderId: randomUUID(),
      },
    };

    let validatedEvent: OrderCreatedEvent;
    try {
      validatedEvent = parse<OrderCreatedEvent>(event, orderCreatedSchema);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    await this.orderEventPublisher.publishOrderCreated(validatedEvent);

    return {
      orderId: validatedEvent.payload.orderId,
      eventId: validatedEvent.id,
      status: 'PENDING',
    };
  }
}