import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { StripeModule } from './payments/stripe/stripe.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, StripeModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
