import { AbstractDocument } from '@app/common';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled';

@Schema({ versionKey: false })
export class ReservationDocument extends AbstractDocument {
  @Prop()
  timestamp!: Date;

  @Prop()
  startDate!: Date;

  @Prop()
  endDate!: Date;

  @Prop()
  userId!: string;

  @Prop()
  invoiceId?: string;

  @Prop()
  amount!: number;

  @Prop({ default: 'pending' })
  status!: ReservationStatus;

  @Prop()
  checkoutSessionId?: string;
}

export const ReservationSchema =
  SchemaFactory.createForClass(ReservationDocument);
