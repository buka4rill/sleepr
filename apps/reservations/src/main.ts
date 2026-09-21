import { NestFactory } from '@nestjs/core';
import { ReservationsModule } from './reservations.module';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { Transport } from '@nestjs/microservices';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(ReservationsModule);

  app.use(cookieParser());

  // validation
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // logger
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);

  app.connectMicroservice({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: configService.get<number>('TCP_PORT') ?? 3006,
    },
  });
  await app.startAllMicroservices();

  await app.listen(configService.get('HTTP_PORT') ?? 3000);
}
bootstrap().catch((reason) => console.error(reason));
