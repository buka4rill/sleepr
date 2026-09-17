import {
  CanActivate,
  Injectable,
  ExecutionContext,
  Inject,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Observable, tap, map, catchError, of } from 'rxjs';
import { AUTH_SERVICE } from '../constants/services';
import { ClientProxy } from '@nestjs/microservices';
import { UserDto } from '../dto';
import { Reflector } from '@nestjs/core';

type AuthenticatedRequest = {
  cookies?: { Authentication?: string };
  headers?: { authentication?: string };
  user?: unknown;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    @Inject(AUTH_SERVICE) private readonly authClient: ClientProxy,
    private readonly reflector: Reflector,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const jwt =
      request.cookies?.Authentication || request.headers?.authentication;

    if (!jwt) {
      return false;
    }

    const roles = this.reflector.get<string[]>('roles', context.getHandler());

    return this.authClient
      .send<UserDto>('authenticate', {
        Authentication: jwt,
      })
      .pipe(
        tap((res) => {
          if (!roles || roles.length === 0) return;
          for (const role of roles) {
            if (!res.roles?.includes(role)) {
              this.logger.error('The user does not have valid roles.');
              throw new UnauthorizedException();
            }
          }

          request.user = res;
        }),
        map(() => true),
        catchError((err) => {
          this.logger.error('Authentication failed: ', err);
          return of(false);
        }),
      );
  }
}
