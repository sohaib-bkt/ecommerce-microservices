import { Module } from '@nestjs/common';
import { OrderEventPublisher } from './order-event.publisher.js';
import { OrdersController } from './orders.controller.js';

@Module({
  controllers: [OrdersController],
  providers: [OrderEventPublisher],
})
export class OrdersModule {}