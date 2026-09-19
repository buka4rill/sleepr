import { Type } from 'class-transformer';
import { CardDto } from './card.dto';
import {
  IsNotEmptyObject,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateChargeDto {
  // @IsDefined()
  @IsOptional()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => CardDto)
  card?: CardDto;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  // Used as the Stripe idempotency key so a retried request reuses the
  // original charge instead of billing the card twice. Only protective if
  // the *caller* generates this once and resends the same value on retry
  // (e.g. the frontend keeps one UUID per checkout attempt); if omitted,
  // PaymentsService falls back to generating its own, which is fine for a
  // one-off call but gives no protection against the caller retrying.
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
