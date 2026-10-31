import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductController } from './product.controller.js';
import { ProductEventPublisher } from './product-event.publisher.js';
import { ProductSearchConsumer } from './product-search.consumer.js';
import { ProductSearchService, ELASTICSEARCH_CLIENT } from './product-search.service.js';
import { ProductService } from './product.service.js';
import { Client } from '@elastic/elasticsearch';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [ProductController, ProductSearchConsumer],
  providers: [
    ProductService,
    ProductEventPublisher,
    ProductSearchService,
    {
      provide: ELASTICSEARCH_CLIENT,
      useFactory: () =>
        new Client({ node: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200' }),
    },
  ],
})
export class AppModule {}
