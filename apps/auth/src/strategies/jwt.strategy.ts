import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { TokenPayload } from '../interfaces/token-payload.interface';

interface AuthRequest {
  cookies?: Record<string, string | undefined>;
  Authentication?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: AuthRequest) => {
          const token =
            request?.cookies?.Authentication || request?.Authentication;
          return token || null;
        },
      ]),
      secretOrKey: jwtSecret || '',
    });
  }

  async validate({ userId }: TokenPayload) {
    return this.usersService.getUser({ _id: userId });
  }
}
