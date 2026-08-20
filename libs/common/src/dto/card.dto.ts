import {
  IsCreditCard,
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateIf,
} from 'class-validator';

// Either a raw card (number/exp/cvc) or a Stripe token is required, not both:
// Stripe blocks raw card data on the API by default (PCI reasons), so a test
// token like "tok_visa" is the fallback until raw-card access is approved.
export class CardDto {
  @ValidateIf((card: CardDto) => !card.token)
  @IsString()
  @IsNotEmpty()
  cvc?: string;

  @ValidateIf((card: CardDto) => !card.token)
  @IsNumber()
  exp_month?: number;

  @ValidateIf((card: CardDto) => !card.token)
  @IsNumber()
  exp_year?: number;

  @ValidateIf((card: CardDto) => !card.token)
  @IsCreditCard()
  number?: string;

  @ValidateIf((card: CardDto) => !card.number)
  @IsString()
  @IsNotEmpty()
  token?: string; // token: "tok_visa" for test mode
}
