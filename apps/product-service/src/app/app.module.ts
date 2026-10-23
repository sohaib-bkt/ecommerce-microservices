import { Module } from '@nestjs/common';
import { ProductController } from './product.controller.js';
import { ProductService } from './product.service.js';

@Module({
  imports: [],
  controllers: [ProductController],
  providers: [ProductService],
})
export class AppModule {}
