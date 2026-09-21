import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import Stripe from 'stripe';

import type { RawBodyRequest } from '@nestjs/common';

@Controller('webhooks')
export class StripeWebhookController {
  constructor(private readonly paymentService: PaymentsService) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  handleStripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    let event: Stripe.Event;

    try {
      event = this.paymentService.constructEvent(request.rawBody!, signature);
    } catch {
      throw new BadRequestException(`Invalid Stripe webhook signature`);
    }

    this.paymentService.handleEvent(event);

    return { received: true };
  }
}
