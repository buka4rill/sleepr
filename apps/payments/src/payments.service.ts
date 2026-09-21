import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import {
  NOTIFICATIONS_SERVICE,
  RESERVATIONS_SERVICE,
  PAYMENT_SUCCEEDED_EVENT,
  PAYMENT_FAILED_EVENT,
  CheckoutSessionCreated,
  CreateCheckoutSessionDto,
} from '@app/common';
import Stripe from 'stripe';
import { randomUUID } from 'crypto';
import { PaymentsCreateChargeDto } from './dto/payments-create-charge.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    @Inject(NOTIFICATIONS_SERVICE)
    private readonly notificationsService: ClientProxy,
    @Inject(RESERVATIONS_SERVICE)
    private readonly reservationsService: ClientProxy,
  ) {
    this.stripe = new Stripe(
      this.configService.getOrThrow<string>('STRIPE_SECRET_KEY'),
      {
        apiVersion: '2026-07-29.dahlia',
      },
    );
  }

  async createCharge({
    card,
    amount,
    email,
    idempotencyKey,
  }: PaymentsCreateChargeDto): Promise<Stripe.Response<Stripe.PaymentIntent>> {
    // Fall back to a server-generated key if the caller didn't send one.
    // The fallback only de-dupes retries *within this single call* (e.g.
    // Stripe's own SDK-level network retries, which already attach their
    // own key automatically) — it can't protect against the caller retrying
    // the whole request, since a new key would be generated each time that
    // happens. Real protection requires the caller to keep resending the
    // same key on retry (see CreateChargeDto).
    const key = idempotencyKey ?? randomUUID();

    // Prefer the token form: Stripe rejects raw card numbers with a 402
    // invalid_request_error unless the account has raw-card-data access
    // enabled for test mode, so raw fields only work once that's granted.
    //
    // Stripe's idempotency store keys on the request signature, not just
    // the key string, so reusing one key across two different endpoints
    // (payment method vs. payment intent) would make the second call fail
    // with "key already used with different parameters". Suffix per call.
    const paymentMethod = await this.stripe.paymentMethods.create(
      {
        type: 'card',
        card: card?.token
          ? { token: card.token }
          : {
              number: card!.number,
              exp_month: card!.exp_month,
              exp_year: card!.exp_year,
              cvc: card!.cvc,
            },
      },
      { idempotencyKey: `${key}:payment-method` },
    );

    const paymentIntent = await this.stripe.paymentIntents.create(
      {
        payment_method: paymentMethod.id,
        amount: amount * 100, // Stripe expects the amount in the smallest currency unit (e.g., cents for USD)
        confirm: true,
        payment_method_types: ['card'],
        currency: 'usd',
      },
      // This is the call that actually moves money, so this key is the one
      // that matters most for preventing a duplicate charge on retry.
      { idempotencyKey: `${key}:payment-intent` },
    );

    // emit notification
    this.notificationsService.emit('notify_email', {
      email,
      text: `Your payment of $${amount} was completed successfully.`,
    });

    return paymentIntent;
  }

  async createCheckoutSession({
    amount,
    email,
    reservationId,
  }: CreateCheckoutSessionDto): Promise<CheckoutSessionCreated> {
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Sleepr Reservation ${reservationId}`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: email,
      client_reference_id: reservationId,
      metadata: {
        reservationId,
      },
      success_url: this.configService.getOrThrow('STRIPE_SUCCESS_URL'),
      cancel_url: this.configService.getOrThrow('STRIPE_CANCEL_URL'),
    });

    return {
      id: session.id,
      url: session.url!,
    };
  }

  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.configService.get<string>('STRIPE_WEBHOOK_SECRET') as string,
    );
  }

  handleEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed': {
        // const session = event.data.object;
        this.handlePaymentSucceeded(event.data.object);
        break;
      }
      case 'checkout.session.expired': {
        this.handlePaymentFailed(event.data.object, event.type);
        break;
      }

      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  private handlePaymentSucceeded(session: Stripe.Checkout.Session) {
    const reservationId = session.metadata?.reservationId;
    if (!reservationId) {
      this.logger.warn(
        `Checkout session ${session.id} completed without a reservationId`,
      );
      return;
    }

    this.reservationsService.emit(PAYMENT_SUCCEEDED_EVENT, {
      reservationId,
      paymentIntentId: session.payment_intent,
    });

    const email = session.customer_details?.email ?? session.customer_email;
    if (email) {
      this.notificationsService.emit('notify_email', {
        email,
        text: `Your payment for ${(session.amount_total ?? 0) / 100} was successful.`,
      });
    }
  }

  private handlePaymentFailed(
    session: Stripe.Checkout.Session,
    reason: string,
  ) {
    const reservationId = session.metadata?.reservationId;
    if (!reservationId) {
      return;
    }

    this.reservationsService.emit(PAYMENT_FAILED_EVENT, {
      reservationId,
      reason,
    });
  }
}
