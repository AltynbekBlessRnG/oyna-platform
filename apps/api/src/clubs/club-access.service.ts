import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { AddClubMemberRequest, AuthUser, ClubMember, ClubMemberRole, ManagedClub } from "@oyna/contracts";
import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { ClubsService } from "./clubs.service";

interface MemberRow {
  club_id: string;
  user_id: string;
  name: string;
  phone: string;
  role: ClubMemberRole;
  created_at: Date | string;
}

/**
 * Права на управление клубом. Владелец платформы (`platform_admin`) видит все клубы,
 * администратор клуба — только те, где есть запись в `club_memberships`.
 * Без базы данных проверка вырождается в проверку роли: это режим локальной демонстрации.
 */
@Injectable()
export class ClubAccessService {
  constructor(
    private readonly database: DatabaseService,
    private readonly clubs: ClubsService,
    private readonly auth: AuthService
  ) {}

  async canManage(user: AuthUser, clubId: string): Promise<boolean> {
    if (user.role === "platform_admin") return true;
    if (!this.database.configured) return user.role === "club_admin";
    const result = await this.database.query("SELECT 1 FROM club_memberships WHERE club_id = $1 AND user_id = $2 AND role = 'admin'", [clubId, user.id]);
    return result.rowCount === 1;
  }

  async assertCanManage(user: AuthUser, clubId: string): Promise<void> {
    if (!(await this.canManage(user, clubId))) throw new ForbiddenException("Club admin access required");
  }

  async listManagedClubs(user: AuthUser): Promise<ManagedClub[]> {
    const all = await this.clubs.findAll();
    if (user.role === "platform_admin" || !this.database.configured) {
      if (user.role === "player") return [];
      return all.map((club) => ({ id: club.id, name: club.name, city: club.city, role: "admin" as const }));
    }
    const result = await this.database.query<{ club_id: string; role: ClubMemberRole }>(
      "SELECT club_id, role FROM club_memberships WHERE user_id = $1 AND role = 'admin'",
      [user.id]
    );
    return result.rows
      .map((row) => {
        const club = all.find((item) => item.id === row.club_id);
        return club ? { id: club.id, name: club.name, city: club.city, role: row.role } : undefined;
      })
      .filter((club): club is ManagedClub => club !== undefined);
  }

  async listMembers(clubId: string): Promise<ClubMember[]> {
    this.requireDatabase();
    await this.clubs.findOne(clubId);
    const result = await this.database.query<MemberRow>(
      `SELECT m.club_id, m.user_id, u.name, u.phone, m.role, m.created_at
       FROM club_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.club_id = $1 ORDER BY m.created_at`,
      [clubId]
    );
    return result.rows.map((row) => this.map(row));
  }

  /** Выдаёт права по номеру телефона: пользователь может ещё ни разу не заходить в приложение. */
  async addMember(clubId: string, request: AddClubMemberRequest): Promise<ClubMember> {
    this.requireDatabase();
    await this.clubs.findOne(clubId);
    const role: ClubMemberRole = request.role === "moderator" ? "moderator" : "admin";
    const user = await this.auth.ensureUser(request.phone, request.name);
    if (user.role === "player") await this.auth.grantRole(user.id, "club_admin");
    const result = await this.database.query<MemberRow>(
      `INSERT INTO club_memberships (club_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (club_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING club_id, user_id, $4::text AS name, $5::text AS phone, role, created_at`,
      [clubId, user.id, role, user.name, user.phone]
    );
    return this.map(result.rows[0]);
  }

  async removeMember(clubId: string, userId: string): Promise<void> {
    this.requireDatabase();
    const result = await this.database.query("DELETE FROM club_memberships WHERE club_id = $1 AND user_id = $2", [clubId, userId]);
    if (!result.rowCount) throw new NotFoundException("Membership not found");
    const remaining = await this.database.query("SELECT 1 FROM club_memberships WHERE user_id = $1 LIMIT 1", [userId]);
    if (!remaining.rowCount) await this.auth.grantRole(userId, "player");
  }

  private requireDatabase(): void {
    if (!this.database.configured) throw new ServiceUnavailableException("Управление правами доступно только с подключённой базой данных");
  }

  private map(row: MemberRow): ClubMember {
    return { clubId: row.club_id, userId: row.user_id, name: row.name, phone: row.phone, role: row.role, createdAt: new Date(row.created_at).toISOString() };
  }
}
