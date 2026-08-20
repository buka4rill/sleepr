import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationsRepository } from './reservations.repository';
import { PAYMENTS_SERVICE } from '@app/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, mergeMap, Observable } from 'rxjs';
import { ReservationDocument } from './models/reservation.schema';
import { randomUUID } from 'crypto';

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly reservationsRepository: ReservationsRepository,
    @Inject(PAYMENTS_SERVICE) private readonly paymentsService: ClientProxy,
  ) {}

  create(
    createReservationDto: CreateReservationDto,
    userId: string,
  ): Observable<ReservationDocument> {
    // Generate the idempotency key once per reservation attempt (not per
    // Stripe call) so a caller-side retry that reuses this same DTO reaches
    // PaymentsService with the same key both times, instead of minting a
    // fresh one on every hit — which would defeat the point of the key.
    // The client can also send its own charge.idempotencyKey up front to
    // keep the key stable across its own HTTP-level retries; this only
    // fills the gap when it doesn't.
    const charge = {
      ...createReservationDto.charge,
      idempotencyKey:
        createReservationDto.charge.idempotencyKey ?? randomUUID(),
    };

    return this.paymentsService.send('create_charge', charge).pipe(
      mergeMap((res: { id: string }) =>
        this.reservationsRepository.create({
          ...createReservationDto,
          invoiceId: res.id, // payment intent id
          timestamp: new Date(),
          userId,
        }),
      ),
      // Surface a clean, client-safe error instead of leaking the raw
      // Stripe/RPC failure (e.g. a full StripeCardError) back to callers.
      catchError((error) => {
        this.logger.error('Failed to create reservation charge', error);
        throw new BadRequestException('Payment failed');
      }),
    );
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
