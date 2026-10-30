import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { OrderStatusRepository } from './order-status.repository.js';
import { OrderStatusService } from './order-status.service.js';
import { PaymentResultConsumer } from './payment-result.consumer.js';

@Module({
  imports: [DatabaseModule],
  controllers: [PaymentResultConsumer],
  providers: [OrderStatusRepository, OrderStatusService],
  exports: [OrderStatusService],
})
export class OrdersModule {}