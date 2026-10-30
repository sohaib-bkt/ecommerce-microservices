import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import {
  ecommerce,
  orderCreatedSchema,
  parse,
} from '@ecommerce-platform/contracts';
import type { EventEnvelope, OrderCreatedPayload } from '@ecommerce-platform/contracts';
import { OrderOutboxPublisher } from './order-outbox.publisher.js';
import { OrderRepository } from './order.repository.js';
import { ProductClientService } from './product-client.service.js';

type CreateOrderRequest = ecommerce.order.v1.CreateOrderRequest;
type Order = ecommerce.order.v1.Order;
type OrderCreatedEvent = EventEnvelope<'OrderCreated', OrderCreatedPayload>;
type OrderLine = {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: { amount: number; currency: string };
};

@Injectable()
export class OrderCreationService {
  private readonly logger = new Logger(OrderCreationService.name);

  constructor(
    private readonly productClient: ProductClientService,
    private readonly orderRepository: OrderRepository,
    private readonly outboxPublisher: OrderOutboxPublisher,
  ) {}

  async createOrder(request: CreateOrderRequest): Promise<{ order: Order }> {
    if (!request.accountId?.trim() || !Array.isArray(request.items) || request.items.length === 0) {
      throw new RpcException({ code: 3, message: 'accountId and at least one item are required' });
    }

    const quantities = new Map<string, number>();
    for (const item of request.items) {
      if (!item.productId?.trim() || !Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new RpcException({ code: 3, message: 'Each item needs a productId and positive integer quantity' });
      }
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }

    const lines = await Promise.all(
      [...quantities.entries()].map(async ([productId, quantity]): Promise<OrderLine> => {
        let response: ecommerce.product.v1.GetProductResponse;
        try {
          response = await firstValueFrom(this.productClient.getProduct({ id: productId }));
        } catch (error) {
          const grpcError = error as { code?: number; details?: string; message?: string };
          const message = grpcError.details ?? grpcError.message ?? '';
          if (message.includes('Product not found')) {
            throw new RpcException({ code: 5, message: `Product not found: ${productId}` });
          }
          throw new RpcException({ code: grpcError.code ?? 14, message: 'Product service is unavailable' });
        }

        const product = response.product;
        if (!product) {
          throw new RpcException({ code: 5, message: `Product not found: ${productId}` });
        }
        if (product.status !== ecommerce.product.v1.ProductStatus.PRODUCT_STATUS_ACTIVE) {
          throw new RpcException({ code: 9, message: `Product is not available: ${productId}` });
        }

        const amount = Number(product.price?.amount ?? 0);
        const currency = String(product.price?.currency ?? product.currency ?? '').toUpperCase();
        if (!Number.isSafeInteger(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) {
          throw new RpcException({ code: 9, message: `Product has invalid price data: ${productId}` });
        }

        return {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          quantity,
          unitPrice: { amount, currency },
        };
      }),
    );

    const currency = lines[0].unitPrice.currency;
    if (lines.some((line) => line.unitPrice.currency !== currency)) {
      throw new RpcException({ code: 9, message: 'All order items must use the same currency' });
    }

    const amount = lines.reduce(
      (total, line) => total + line.unitPrice.amount * line.quantity,
      0,
    );
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new RpcException({ code: 3, message: 'Order total is invalid' });
    }

    const orderId = randomUUID();
    const reserved: Array<{ productId: string; quantity: number; reservationId: string }> = [];

    try {
      for (const line of lines) {
        const reservationId = `${orderId}:${line.productId}`;
        const reservation = await firstValueFrom(
          this.productClient.reserveStock({
            productId: line.productId,
            quantity: line.quantity,
            reservationId,
          }),
        );
        if (!reservation.fulfilled) {
          throw new RpcException({
            code: 9,
            message: `Insufficient stock for product ${line.productId}`,
          });
        }
        reserved.push({ productId: line.productId, quantity: line.quantity, reservationId });
      }

      const now = Date.now();
      const order: Order = {
        id: orderId,
        accountId: request.accountId,
        status: ecommerce.order.v1.OrderStatus.ORDER_STATUS_PENDING,
        items: lines,
        total: { amount, currency },
        currency,
        shippingAddress: request.shippingAddress,
        paymentId: '',
        createdAt: { epochMillis: now },
        updatedAt: { epochMillis: now },
      };
      const event: OrderCreatedEvent = parse<OrderCreatedEvent>(
        {
          id: `evt_${randomUUID()}`,
          type: 'OrderCreated',
          occurredAt: now,
          source: 'order-service',
          version: 1,
          payload: {
            orderId,
            accountId: request.accountId,
            items: lines,
            total: { amount, currency },
            ...(request.shippingAddress ? { shippingAddress: request.shippingAddress } : {}),
          },
        },
        orderCreatedSchema,
      );

      await this.orderRepository.createWithOutbox(order, event);
      await this.outboxPublisher.flushPending();
      return { order };
    } catch (error) {
      await this.releaseReservations(reserved);
      if (error instanceof RpcException) throw error;
      this.logger.error(`Unable to create order ${orderId}`, error);
      throw new RpcException({ code: 13, message: 'Unable to create order' });
    }
  }

  private async releaseReservations(
    reservations: Array<{ productId: string; quantity: number; reservationId: string }>,
  ): Promise<void> {
    for (const reservation of reservations.reverse()) {
      try {
        await firstValueFrom(this.productClient.releaseStock(reservation));
      } catch (error) {
        this.logger.error(
          `Unable to release stock reservation ${reservation.reservationId}`,
          error,
        );
      }
    }
  }
}