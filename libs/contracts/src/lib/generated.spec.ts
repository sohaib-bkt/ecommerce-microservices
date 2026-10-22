import { describe, expect, it } from '@jest/globals';
import { ecommerce } from '../generated/index.js';

describe('generated proto contracts', () => {
  it('exposes the account service definition', () => {
    expect(ecommerce.account.v1.AccountServiceDefinition.name).toBe(
      'AccountService',
    );
    expect(
      Object.keys(ecommerce.account.v1.AccountServiceDefinition.methods),
    ).toEqual(['getAccount', 'listAccounts', 'createAccount', 'updateAccount']);
  });

  it('exposes the product service definition', () => {
    expect(ecommerce.product.v1.ProductServiceDefinition.name).toBe(
      'ProductService',
    );
    expect(
      ecommerce.product.v1.ProductServiceDefinition.methods.reserveStock,
    ).toBeDefined();
  });

  it('exposes the order service definition', () => {
    expect(ecommerce.order.v1.OrderServiceDefinition.name).toBe('OrderService');
  });

  it('exposes the payment service definition', () => {
    expect(ecommerce.payment.v1.PaymentServiceDefinition.name).toBe(
      'PaymentService',
    );
  });

  it('encodes and decodes a Money message', () => {
    const { Money } = ecommerce.common.v1;
    const original = { currency: 'USD', amount: 1999 };
    const encoded = Money.encode(original).finish();
    const decoded = Money.decode(encoded);

    expect(decoded).toEqual(original);
  });

  it('round-trips a nested Account message', () => {
    const { Address, Timestamp, Money } = ecommerce.common.v1;
    const { Account: AccountMessage } = ecommerce.account.v1;

    const original = {
      id: 'account-1',
      email: 'buyer@example.com',
      displayName: 'Buyer',
      status: 1,
      shippingAddress: {
        line1: '1 Main St',
        line2: '',
        city: 'Springfield',
        region: 'IL',
        postalCode: '62704',
        country: 'US',
      },
      createdAt: { epochMillis: 1_700_000_000_000 },
      updatedAt: { epochMillis: 1_700_000_000_000 },
    };

    const decoded = AccountMessage.decode(
      AccountMessage.encode(original).finish(),
    );
    expect(decoded.id).toBe('account-1');
    expect(decoded.shippingAddress?.city).toBe('Springfield');
    expect(decoded.createdAt?.epochMillis).toBe(1_700_000_000_000);
    expect(Money).toBeDefined();
    expect(Address).toBeDefined();
    expect(Timestamp).toBeDefined();
  });

  it('round-trips an Order with items', () => {
    const { Order, OrderItem } = ecommerce.order.v1;

    const original = {
      id: 'order-1',
      accountId: 'account-1',
      status: 1,
      items: [
        {
          productId: 'product-1',
          sku: 'SKU-1',
          name: 'Widget',
          quantity: 2,
          unitPrice: { currency: 'USD', amount: 1999 },
        },
      ],
      total: { currency: 'USD', amount: 3998 },
      currency: 'USD',
      shippingAddress: undefined,
      paymentId: '',
      createdAt: { epochMillis: 1_700_000_000_000 },
      updatedAt: { epochMillis: 1_700_000_000_000 },
    };

    const decoded = Order.decode(Order.encode(original).finish());
    expect(decoded.items).toHaveLength(1);
    expect(decoded.items[0]?.sku).toBe('SKU-1');
    expect(decoded.total?.amount).toBe(3998);
    expect(OrderItem).toBeDefined();
  });
});
