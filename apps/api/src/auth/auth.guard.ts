import { CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import type { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { headers: Record<string, string | undefined> }>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw new UnauthorizedException("Authentication required");
    request.user = this.authService.verifyToken(authorization.slice(7));
    return true;
  }
}

