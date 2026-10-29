import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { OrdersModule } from './orders/orders.module.js';
import { ProductModule } from './product.module.js';

@Module({
  imports: [
    // Loads .env from the workspace root and makes ConfigService global.
    ConfigModule.forRoot({ isGlobal: true }),
    ProductModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
