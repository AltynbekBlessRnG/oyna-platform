import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const expected = process.env.CLUB_ADMIN_KEY ?? "pilot-admin";
    if (request.headers["x-club-admin-key"] !== expected) throw new ForbiddenException("Club admin access required");
    return true;
  }
}

