import {
  CanActivate,
  Injectable,
  ExecutionContext,
  Inject,
} from '@nestjs/common';
import { Observable, tap, map } from 'rxjs';
import { AUTH_SERVICE } from '../constants/services';
import { ClientProxy } from '@nestjs/microservices';
import { UserDto } from '../dto';

type AuthenticatedRequest = {
  cookies?: { Authentication?: string };
  user?: unknown;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(AUTH_SERVICE) private readonly authClient: ClientProxy) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const jwt = request.cookies?.Authentication;

    if (!jwt) {
      return false;
    }

    return this.authClient
      .send<UserDto>('authenticate', {
        Authentication: jwt,
      })
      .pipe(
        tap((res) => {
          request.user = res;
        }),
        map(() => true),
      );
  }
}
