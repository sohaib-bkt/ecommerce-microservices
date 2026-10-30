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
  async getOrderStatus(@Param('orderId') orderId: string) {
    const status = await this.orderStatusService.getStatus(orderId);
    return status ?? {
      orderId,
      status: 'PENDING',
      reason: 'no payment result received yet',
    };
  }
}
