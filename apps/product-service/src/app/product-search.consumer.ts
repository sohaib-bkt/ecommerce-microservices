import { Controller, Logger } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import {
  parse,
  productCreatedSchema,
  productUpdatedSchema,
  SchemaValidationError,
} from '@ecommerce-platform/contracts';
import type { ProductCreatedPayload, ProductUpdatedPayload } from '@ecommerce-platform/contracts';
import { ProductSearchService } from './product-search.service.js';
import { StoredProduct } from './product.service.js';

@Controller()
export class ProductSearchConsumer {
  private readonly logger = new Logger(ProductSearchConsumer.name);

  constructor(private readonly productSearchService: ProductSearchService) {}

  @EventPattern('product.created')
  async handleCreated(data: unknown): Promise<void> {
    let event: { occurredAt: number; payload: ProductCreatedPayload };
    try {
      event = parse(data, productCreatedSchema);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        this.logger.warn(`Dropping invalid ProductCreated event: ${error.message}`);
        return;
      }
      throw error;
    }
    await this.productSearchService.indexProduct(this.fromCreated(event));
  }

  @EventPattern('product.updated')
  async handleUpdated(data: unknown): Promise<void> {
    let event: { payload: ProductUpdatedPayload };
    try {
      event = parse(data, productUpdatedSchema);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        this.logger.warn(`Dropping invalid ProductUpdated event: ${error.message}`);
        return;
      }
      throw error;
    }
    await this.productSearchService.indexProduct(this.fromUpdated(event.payload));
  }

  private fromCreated(event: { occurredAt: number; payload: ProductCreatedPayload }): StoredProduct {
    const payload = event.payload;
    const now = event.occurredAt;
    return {
      id: payload.productId,
      sku: payload.sku,
      name: payload.name,
      description: payload.description ?? '',
      price: payload.price,
      currency: payload.currency ?? payload.price.currency,
      stockQuantity: payload.stockQuantity,
      status: this.statusNumber(payload.status ?? 'ACTIVE'),
      categoryIds: payload.categoryIds ?? [],
      createdAt: { epochMillis: payload.createdAt ?? now },
      updatedAt: { epochMillis: payload.updatedAt ?? now },
    };
  }

  private fromUpdated(payload: ProductUpdatedPayload): StoredProduct {
    return {
      id: payload.productId,
      sku: payload.sku,
      name: payload.name,
      description: payload.description,
      price: payload.price,
      currency: payload.currency,
      stockQuantity: payload.stockQuantity,
      status: this.statusNumber(payload.status),
      categoryIds: payload.categoryIds,
      createdAt: { epochMillis: payload.createdAt },
      updatedAt: { epochMillis: payload.updatedAt },
    };
  }

  private statusNumber(status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'): number {
    if (status === 'DRAFT') return 1;
    if (status === 'ARCHIVED') return 3;
    return 2;
  }
}