import { Controller, Get, Param } from '@nestjs/common';
import { AppService } from './app.service';
import { OrderStatusService } from './orders/order-status.service.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly orderStatusService: OrderStatusService,
  ) {}

  @Get()
  getData() {
    return this.appService.getData();
  }

  @Get('orders/:orderId/status')
  getOrderStatus(@Param('orderId') orderId: string) {
    return this.orderStatusService.getStatus(orderId) ?? {
      orderId,
      status: 'PENDING',
      reason: 'no payment result received yet',
    };
  }
}
