import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  PAYMENT_SUCCEEDED_EVENT,
  PaymentSucceededDto,
  PAYMENT_FAILED_EVENT,
  PaymentFailedDto,
} from '@app/common';
import type { UserDto } from '@app/common';
import { ReservationDocument } from './models/reservation.schema';
import { EventPattern } from '@nestjs/microservices';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() createReservationDto: CreateReservationDto,
    @CurrentUser() user: UserDto,
  ): Promise<ReservationDocument> {
    return this.reservationsService.create(createReservationDto, user);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(): Promise<ReservationDocument[]> {
    return this.reservationsService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string): Promise<ReservationDocument> {
    return this.reservationsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateReservationDto: UpdateReservationDto,
  ): Promise<ReservationDocument> {
    return this.reservationsService.update(id, updateReservationDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('Admin')
  async remove(@Param('id') id: string): Promise<ReservationDocument> {
    return this.reservationsService.remove(id);
  }

  @EventPattern(PAYMENT_SUCCEEDED_EVENT)
  @UsePipes(new ValidationPipe())
  async handlePaymentSucceeded(@Payload() payload: PaymentSucceededDto) {
    return this.reservationsService.handlePaymentSucceeded(payload);
  }

  @EventPattern(PAYMENT_FAILED_EVENT)
  @UsePipes(new ValidationPipe())
  async handlePaymentFailed(@Payload() payload: PaymentFailedDto) {
    return this.reservationsService.handlePaymentFailed(payload);
  }
}
