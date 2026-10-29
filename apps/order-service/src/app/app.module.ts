import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), OrdersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
