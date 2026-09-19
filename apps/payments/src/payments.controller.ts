import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PaymentsCreateChargeDto } from './dto/payments-create-charge.dto';
import Stripe from 'stripe';
import {
  CreateCheckoutSessionDto,
  CheckoutSessionCreated,
} from '@app/common/dto/create-checkout-session.dto';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @MessagePattern('create_charge')
  @UsePipes(new ValidationPipe())
  async createCharge(
    @Payload() data: PaymentsCreateChargeDto,
  ): Promise<Stripe.Response<Stripe.PaymentIntent>> {
    return this.paymentsService.createCharge(data);
  }

  @MessagePattern('create_checkout_session')
  @UsePipes(new ValidationPipe())
  async createCheckoutSession(
    @Payload() data: CreateCheckoutSessionDto,
  ): Promise<CheckoutSessionCreated> {
    return this.paymentsService.createCheckoutSession(data);
  }
}
