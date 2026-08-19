import { PaymentMethodCreateParams } from 'stripe';

export class CreateChargeDto {
  card!: PaymentMethodCreateParams.Card;
  amount!: number;
}
