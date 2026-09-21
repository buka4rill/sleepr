import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Joi from 'joi';
import {
  LoggerModule,
  NOTIFICATIONS_SERVICE,
  RESERVATIONS_SERVICE,
} from '@app/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/payments/.env',
      validationSchema: Joi.object({
        TCP_PORT: Joi.number().required(),
        HTTP_PORT: Joi.number().required(),
        STRIPE_SECRET_KEY: Joi.string().required(),
        STRIPE_SUCCESS_URL: Joi.string().uri().required(),
        STRIPE_CANCEL_URL: Joi.string().uri().required(),
        STRIPE_WEBHOOK_SECRET: Joi.string().required(),
        NOTIFICATIONS_HOST: Joi.string().required(),
        NOTIFICATIONS_PORT: Joi.number().required(),
        RESERVATIONS_HOST: Joi.string().required(),
        RESERVATIONS_PORT: Joi.number().required(),
      }),
    }),
    LoggerModule,
    ClientsModule.registerAsync([
      {
        name: NOTIFICATIONS_SERVICE,
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('NOTIFICATIONS_HOST'),
            port: configService.get<number>('NOTIFICATIONS_PORT'),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: RESERVATIONS_SERVICE,
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('RESERVATIONS_HOST'),
            port: configService.get<number>('RESERVATIONS_PORT'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [PaymentsController, StripeWebhookController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
