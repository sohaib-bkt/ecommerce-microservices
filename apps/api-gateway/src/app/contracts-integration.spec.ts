import { EVENT_TYPES, ecommerce } from '@ecommerce-platform/contracts';

describe('@ecommerce-platform/contracts integration', () => {
  it('loads event types and proto definitions at runtime', () => {
    expect(EVENT_TYPES).toContain('OrderCreated');
    expect(ecommerce.account.v1.AccountServiceDefinition.name).toBe(
      'AccountService',
    );
  });
});
