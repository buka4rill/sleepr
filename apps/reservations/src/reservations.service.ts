import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationsRepository } from './reservations.repository';
import { PAYMENTS_SERVICE, UserDto } from '@app/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { ReservationDocument } from './models/reservation.schema';
import { randomUUID } from 'crypto';
import { CheckoutSessionCreated } from '@app/common/dto/create-checkout-session.dto';

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly reservationsRepository: ReservationsRepository,
    @Inject(PAYMENTS_SERVICE) private readonly paymentsService: ClientProxy,
  ) {}

  create(
    createReservationDto: CreateReservationDto,
    user: UserDto,
  ): Promise<ReservationDocument> {
    if (createReservationDto.charge.card) {
      return this.createWithDirectCharge(createReservationDto, user);
    }
    return this.createWithCheckoutSession(createReservationDto, user);
  }

  private async createWithDirectCharge(
    createReservationDto: CreateReservationDto,
    { email, _id: userId }: UserDto,
  ): Promise<ReservationDocument> {
    // Generate the idempotency key once per reservation attempt (not per
    // Stripe call) so a caller-side retry that reuses this same DTO reaches
    // PaymentsService with the same key both times, instead of minting a
    // fresh one on every hit — which would defeat the point of the key.
    // The client can also send its own charge.idempotencyKey up front to
    // keep the key stable across its own HTTP-level retries; this only
    // fills the gap when it doesn't.
    const charge = {
      ...createReservationDto.charge,
      email,
      idempotencyKey:
        createReservationDto.charge.idempotencyKey ?? randomUUID(),
    };

    try {
      const paymentIntent = await lastValueFrom(
        this.paymentsService.send<{ id: string }>('create_charge', charge),
      );

      return this.reservationsRepository.create({
        ...createReservationDto,
        amount: charge.amount,
        status: 'confirmed',
        invoiceId: paymentIntent.id, // payment intent id
        timestamp: new Date(),
        userId,
      });
    } catch (error: unknown) {
      // Surface a clean, client-safe error instead of leaking the raw
      // Stripe/RPC failure (e.g. a full StripeCardError) back to callers.
      this.logger.error('Failed to create reservation charge', error);
      throw new BadRequestException('Payment failed');
    }
  }

  private async createWithCheckoutSession(
    { charge, ...createReservationDto }: CreateReservationDto,
    { email, _id: userId }: UserDto,
  ): Promise<ReservationDocument & { paymentUrl: string }> {
    try {
      const reservation = await this.reservationsRepository.create({
        ...createReservationDto,
        amount: charge.amount,
        status: 'pending',
        timestamp: new Date(),
        userId,
      });

      const session = await lastValueFrom(
        this.paymentsService.send<CheckoutSessionCreated>(
          'create_checkout_session',
          {
            amount: charge.amount,
            email,
            reservationId: reservation._id?.toHexString(),
          },
        ),
      );

      const updatedReservation =
        await this.reservationsRepository.findOneAndUpdate(
          { _id: reservation._id },
          { $set: { checkoutSessionId: session.id } },
        );

      return { ...updatedReservation, paymentUrl: session.url };
    } catch (error) {
      this.logger.error(
        'Failed to create reservation with checkout session',
        error,
      );
      throw new BadRequestException(
        'Failed to create reservation with checkout session',
      );
    }
  }

  async findAll(): Promise<ReservationDocument[]> {
    return this.reservationsRepository.find({});
  }

  async findOne(id: string): Promise<ReservationDocument> {
    return this.reservationsRepository.findOne({ _id: id });
  }

  async update(
    id: string,
    updateReservationDto: UpdateReservationDto,
  ): Promise<ReservationDocument> {
    return this.reservationsRepository.findOneAndUpdate(
      { _id: id },
      { $set: updateReservationDto },
    );
  }

  async remove(id: string): Promise<ReservationDocument> {
    return this.reservationsRepository.findOneAndDelete({ _id: id });
  }
}
