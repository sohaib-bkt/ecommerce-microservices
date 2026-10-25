import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { FakeStripeGateway } from './fake-stripe.gateway.js';
import { StripeSdkGateway } from './stripe-sdk.gateway.js';
import { STRIPE_CLIENT, STRIPE_GATEWAY } from './stripe.gateway.js';

@Global()
@Module({
  providers: [
    {
      provide: STRIPE_CLIENT,
      useFactory: (config: ConfigService) => {
        const gateway = config.get<string>('STRIPE_GATEWAY') ?? 'stripe';

        if (gateway === 'fake') {
          return null;
        }

        const secretKey = config.get<string>('STRIPE_SECRET_KEY');
        if (!secretKey) {
          throw new Error('STRIPE_SECRET_KEY is required when STRIPE_GATEWAY=stripe');
        }

        return new Stripe(secretKey);
      },
      inject: [ConfigService],
    },
    {
      provide: STRIPE_GATEWAY,
      useFactory: (config: ConfigService, client: Stripe | null) => {
        const gateway = config.get<string>('STRIPE_GATEWAY') ?? 'stripe';

        if (gateway === 'fake') {
          return new FakeStripeGateway();
        }

        if (gateway !== 'stripe') {
          throw new Error(`Unsupported STRIPE_GATEWAY: ${gateway}`);
        }

        if (!client) {
          throw new Error('STRIPE_CLIENT could not be initialized for the stripe gateway');
        }

        return new StripeSdkGateway(client as any);
      },
      inject: [ConfigService, STRIPE_CLIENT],
    },
  ],
  exports: [STRIPE_CLIENT, STRIPE_GATEWAY],
})
export class StripeModule {}
