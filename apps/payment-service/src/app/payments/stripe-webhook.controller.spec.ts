import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { StripeWebhookController } from './stripe-webhook.controller.js';

describe('StripeWebhookController', () => {
  it('rejects missing raw bodies', async () => {
    const verifier = { verify: jest.fn() } as any;
    const service = { handle: jest.fn() } as any;
    const controller = new StripeWebhookController(verifier, service);

    await expect(controller.handle({}, undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.handle).not.toHaveBeenCalled();
  });

  it('rejects invalid signatures before calling the service', async () => {
    const verifier = { verify: jest.fn(() => { throw new Error('bad'); }) } as any;
    const service = { handle: jest.fn() } as any;
    const controller = new StripeWebhookController(verifier, service);

    await expect(controller.handle({ rawBody: Buffer.from('payload') }, 'sig')).rejects.toBeInstanceOf(BadRequestException);
    expect(service.handle).not.toHaveBeenCalled();
  });

  it('accepts a valid signed event', async () => {
    const event = { id: 'evt_1', type: 'payment_intent.succeeded' } as any;
    const verifier = { verify: jest.fn(() => event) } as any;
    const service = { handle: jest.fn().mockResolvedValue('applied') } as any;
    const controller = new StripeWebhookController(verifier, service);

    await expect(controller.handle({ rawBody: Buffer.from('payload') }, 'sig')).resolves.toEqual({ received: true });
    expect(service.handle).toHaveBeenCalledWith(event);
  });

  it('marks duplicate events as accepted', async () => {
    const event = { id: 'evt_dup', type: 'payment_intent.succeeded' } as any;
    const verifier = { verify: jest.fn(() => event) } as any;
    const service = { handle: jest.fn().mockResolvedValue('duplicate') } as any;
    const controller = new StripeWebhookController(verifier, service);

    await expect(controller.handle({ rawBody: Buffer.from('payload') }, 'sig')).resolves.toEqual({ received: true });
  });

  it('fails loudly when the payment is missing', async () => {
    const event = { id: 'evt_unknown', type: 'payment_intent.succeeded' } as any;
    const verifier = { verify: jest.fn(() => event) } as any;
    const service = { handle: jest.fn().mockResolvedValue('not_found') } as any;
    const controller = new StripeWebhookController(verifier, service);

    await expect(controller.handle({ rawBody: Buffer.from('payload') }, 'sig')).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
