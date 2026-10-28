import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Post,
  Req,
} from '@nestjs/common';
import { StripeWebhookService } from './stripe-webhook.service.js';
import { StripeWebhookVerifier } from './stripe/stripe-webhook.verifier.js';

export interface StripeWebhookRequest {
  rawBody?: Buffer;
}

@Controller('webhooks')
export class StripeWebhookController {
  constructor(
    private readonly verifier: StripeWebhookVerifier,
    private readonly webhooks: StripeWebhookService,
  ) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() request: StripeWebhookRequest,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    if (!request.rawBody) {
      throw new BadRequestException('Missing raw request body');
    }

    let event: any;
    try {
      event = this.verifier.verify(request.rawBody, signature ?? '');
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }

    const result = await this.webhooks.handle(event);

    if (result === 'not_found') {
      throw new InternalServerErrorException('Stripe event did not match any payment');
    }

    return { received: true };
  }
}
