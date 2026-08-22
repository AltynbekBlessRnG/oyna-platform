import { CanActivate, type ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthUser } from "@oyna/contracts";
import { ClubAccessService } from "../clubs/club-access.service";
import { AuthService } from "./auth.service";
import type { AuthenticatedRequest } from "./auth.types";

type GuardedRequest = AuthenticatedRequest & { headers: Record<string, string | undefined>; params: Record<string, string | undefined> };

/** Синтетический владелец платформы для пилотного ключа из `CLUB_ADMIN_KEY`. */
const PILOT_ADMIN: AuthUser = { id: "pilot-admin", phone: "+70000000000", name: "Пилотный доступ", role: "platform_admin" };

function pilotKey(): string | undefined {
  const configured = process.env.CLUB_ADMIN_KEY;
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? undefined : "pilot-admin";
}

/** Опознаёт клиента кабинета: пилотный ключ или пользовательский токен. */
function identify(request: GuardedRequest, auth: AuthService): AuthUser {
  const key = pilotKey();
  if (key && request.headers["x-club-admin-key"] === key) return PILOT_ADMIN;
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) throw new UnauthorizedException("Club admin authentication required");
  return auth.verifyToken(authorization.slice(7));
}

/** Доступ к данным конкретного клуба: маршрут обязан содержать параметр `:clubId`. */
@Injectable()
export class ClubAdminGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly access: ClubAccessService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuardedRequest>();
    request.user = identify(request, this.auth);
    const clubId = request.params?.clubId;
    if (!clubId) throw new ForbiddenException("Club is not specified");
    await this.access.assertCanManage(request.user, clubId);
    return true;
  }
}

/** Опознаёт сотрудника кабинета без привязки к конкретному клубу. */
@Injectable()
export class AdminIdentityGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<GuardedRequest>();
    request.user = identify(request, this.auth);
    if (request.user.role === "player") throw new ForbiddenException("Club admin access required");
    return true;
  }
}

/** Операции уровня платформы: выдача прав администраторам клубов. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<GuardedRequest>();
    request.user = identify(request, this.auth);
    if (request.user.role !== "platform_admin") throw new ForbiddenException("Platform admin access required");
    return true;
  }
}
