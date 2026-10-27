import { Controller, Logger } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { orderCreatedSchema, parse, SchemaValidationError } from '@ecommerce-platform/contracts';
import type { OrderCreatedEvent } from './payment.types.js';
import { PaymentsService } from './payments.service.js';

export const ORDER_CREATED_TOPIC = 'order.created';

@Controller()
export class OrderCreatedConsumer {
  private readonly logger = new Logger(OrderCreatedConsumer.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @EventPattern(ORDER_CREATED_TOPIC)
  async handleOrderCreated(data: unknown): Promise<void> {
    let event: OrderCreatedEvent;
    try {
      event = parse<OrderCreatedEvent>(data, orderCreatedSchema);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        this.logger.warn(`Dropping invalid OrderCreated event: ${error.message}`);
        return;
      }

      throw error;
    }

    await this.paymentsService.handleOrderCreated(event);
  }
}
