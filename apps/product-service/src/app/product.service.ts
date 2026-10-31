import { Injectable } from '@nestjs/common';
import { ecommerce } from '@ecommerce-platform/contracts';

type ProductStatus = ecommerce.product.v1.ProductStatus;

export interface StoredProduct {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: { currency: string; amount: number };
  currency: string;
  stockQuantity: number;
  status: ProductStatus;
  categoryIds: string[];
  createdAt: { epochMillis: number };
  updatedAt: { epochMillis: number };
}

const PRODUCT_STATUS_ACTIVE = 2 as ProductStatus;

type CreateProductRequest = ecommerce.product.v1.CreateProductRequest;
type UpdateProductRequest = ecommerce.product.v1.UpdateProductRequest;
type ReserveStockRequest = ecommerce.product.v1.ReserveStockRequest;
type ReleaseStockRequest = ecommerce.product.v1.ReleaseStockRequest;

@Injectable()
export class ProductService {
  private readonly products = new Map<string, StoredProduct>();
  private nextId = 1;

  constructor() {
    this.seed('SKU-001', 'Widget', 'A reliable widget', 1999, 100);
    this.seed('SKU-002', 'Gadget', 'A fancy gadget', 4999, 50);
    this.seed('SKU-003', 'Doohickey', 'A mysterious doohickey', 999, 200);
  }

  private seed(
    sku: string,
    name: string,
    description: string,
    priceMinor: number,
    stock: number,
  ): void {
    const id = `product-${this.nextId++}`;
    const now = { epochMillis: Date.now() };
    this.products.set(id, {
      id,
      sku,
      name,
      description,
      price: { currency: 'USD', amount: priceMinor },
      currency: 'USD',
      stockQuantity: stock,
      status: PRODUCT_STATUS_ACTIVE,
      categoryIds: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  findById(id: string): StoredProduct | undefined {
    return this.products.get(id);
  }

  allProducts(): StoredProduct[] {
    return [...this.products.values()];
  }

  list(
    pageSize: number,
    categoryId: string,
    status: ProductStatus,
  ): { products: StoredProduct[]; totalItems: number } {
    let all = [...this.products.values()];
    if (categoryId) {
      all = all.filter((p) => p.categoryIds.includes(categoryId));
    }
    if (status !== 0) {
      all = all.filter((p) => p.status === status);
    }
    const size = pageSize > 0 ? pageSize : all.length;
    const page = all.slice(0, size);
    return { products: page, totalItems: all.length };
  }

  create(request: CreateProductRequest): StoredProduct {
    const id = `product-${this.nextId++}`;
    const now = { epochMillis: Date.now() };
    const product: StoredProduct = {
      id,
      sku: request.sku,
      name: request.name,
      description: request.description,
      price: request.price ?? { currency: 'USD', amount: 0 },
      currency: request.price?.currency ?? 'USD',
      stockQuantity: request.stockQuantity,
      status: PRODUCT_STATUS_ACTIVE,
      categoryIds: request.categoryIds ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.products.set(id, product);
    return product;
  }

  update(request: UpdateProductRequest): StoredProduct | undefined {
    const existing = this.products.get(request.id);
    if (!existing) return undefined;
    const updated: StoredProduct = {
      ...existing,
      name: request.name || existing.name,
      description: request.description || existing.description,
      price: request.price ?? existing.price,
      currency: request.price?.currency ?? existing.currency,
      status: request.status || existing.status,
      updatedAt: { epochMillis: Date.now() },
    };
    this.products.set(request.id, updated);
    return updated;
  }

  reserve(request: ReserveStockRequest): {
    productId: string;
    remainingStock: number;
    fulfilled: boolean;
  } {
    const product = this.products.get(request.productId);
    if (!product) {
      return {
        productId: request.productId,
        remainingStock: 0,
        fulfilled: false,
      };
    }
    if (product.stockQuantity < request.quantity) {
      return {
        productId: request.productId,
        remainingStock: product.stockQuantity,
        fulfilled: false,
      };
    }
    product.stockQuantity -= request.quantity;
    product.updatedAt = { epochMillis: Date.now() };
    this.products.set(request.productId, product);
    return {
      productId: request.productId,
      remainingStock: product.stockQuantity,
      fulfilled: true,
    };
  }

  release(request: ReleaseStockRequest): {
    productId: string;
    remainingStock: number;
  } {
    const product = this.products.get(request.productId);
    if (!product) {
      return { productId: request.productId, remainingStock: 0 };
    }
    product.stockQuantity += request.quantity;
    product.updatedAt = { epochMillis: Date.now() };
    this.products.set(request.productId, product);
    return {
      productId: request.productId,
      remainingStock: product.stockQuantity,
    };
  }
}
