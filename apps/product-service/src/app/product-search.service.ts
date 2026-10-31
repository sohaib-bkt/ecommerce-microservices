import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { ecommerce } from '@ecommerce-platform/contracts';
import type { StoredProduct } from './product.service.js';
import { ProductService } from './product.service.js';

export const ELASTICSEARCH_CLIENT = Symbol('ELASTICSEARCH_CLIENT');
export const PRODUCT_SEARCH_INDEX = 'products';

type SearchDocument = {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: { currency: string; amount: number };
  currency: string;
  stockQuantity: number;
  status: number;
  categoryIds: string[];
  createdAt: number;
  updatedAt: number;
};

@Injectable()
export class ProductSearchService implements OnModuleInit {
  private readonly logger = new Logger(ProductSearchService.name);

  constructor(
    @Inject(ELASTICSEARCH_CLIENT) private readonly elasticsearch: Client,
    private readonly productService: ProductService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureIndex();
      for (const product of this.productService.allProducts()) {
        await this.indexProduct(product);
      }
    } catch (error) {
      this.logger.error('Elasticsearch is unavailable; search indexing will retry on events', error);
    }
  }

  async indexProduct(product: StoredProduct): Promise<void> {
    await this.ensureIndex();
    await this.elasticsearch.index({
      index: PRODUCT_SEARCH_INDEX,
      id: product.id,
      document: this.toDocument(product),
      refresh: 'wait_for',
    });
  }

  async searchProducts(
    query: string,
    page: number,
    pageSize: number,
  ): Promise<ecommerce.product.v1.SearchProductsResponse> {
    const currentPage = Math.max(1, page);
    const size = Math.min(100, Math.max(1, pageSize));
    const response = await this.elasticsearch.search<SearchDocument>({
      index: PRODUCT_SEARCH_INDEX,
      from: (currentPage - 1) * size,
      size,
      track_total_hits: true,
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query,
                fields: ['name^3', 'sku^2', 'description', 'categoryIds'],
                fuzziness: 'AUTO',
              },
            },
          ],
          filter: [{ term: { status: ecommerce.product.v1.ProductStatus.PRODUCT_STATUS_ACTIVE } }],
        },
      },
    });

    const totalItems = typeof response.hits.total === 'number'
      ? response.hits.total
      : response.hits.total?.value ?? 0;
    const products = response.hits.hits.flatMap((hit) =>
      hit._source ? [this.toProto(hit._source)] : [],
    );

    return {
      products,
      page: {
        totalItems,
        totalPages: Math.ceil(totalItems / size),
        currentPage,
      },
    };
  }

  private async ensureIndex(): Promise<void> {
    if (await this.elasticsearch.indices.exists({ index: PRODUCT_SEARCH_INDEX })) return;
    await this.elasticsearch.indices.create({
      index: PRODUCT_SEARCH_INDEX,
      mappings: {
        properties: {
          id: { type: 'keyword' },
          sku: { type: 'keyword' },
          name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
          description: { type: 'text' },
          price: { properties: { amount: { type: 'long' }, currency: { type: 'keyword' } } },
          currency: { type: 'keyword' },
          stockQuantity: { type: 'integer' },
          status: { type: 'integer' },
          categoryIds: { type: 'keyword' },
          createdAt: { type: 'date', format: 'epoch_millis' },
          updatedAt: { type: 'date', format: 'epoch_millis' },
        },
      },
    });
  }

  private toDocument(product: StoredProduct): SearchDocument {
    return {
      ...product,
      createdAt: product.createdAt.epochMillis,
      updatedAt: product.updatedAt.epochMillis,
    };
  }

  private toProto(document: SearchDocument): ecommerce.product.v1.Product {
    return {
      id: document.id,
      sku: document.sku,
      name: document.name,
      description: document.description,
      price: document.price,
      currency: document.currency,
      stockQuantity: document.stockQuantity,
      status: document.status as ecommerce.product.v1.ProductStatus,
      categoryIds: document.categoryIds,
      createdAt: { epochMillis: document.createdAt },
      updatedAt: { epochMillis: document.updatedAt },
    };
  }
}