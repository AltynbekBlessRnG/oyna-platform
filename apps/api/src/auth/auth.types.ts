import type { AuthUser } from "@oyna/contracts";

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export interface TokenPayload extends AuthUser {
  exp: number;
}

