import {
  IsEmail,
  IsNumber,
  IsString,
  IsNotEmpty,
  IsPositive,
} from 'class-validator';

export interface CheckoutSessionCreated {
  id: string;
  url: string;
}

export class CreateCheckoutSessionDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  reservationId: string;
}
