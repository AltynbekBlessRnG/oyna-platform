import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser, PlayerProfile, UpdateProfileRequest } from "@oyna/contracts";
import { createHmac } from "node:crypto";
import { DatabaseService } from "../database/database.service";

interface ProfileRow {
  id: string; name: string; nickname: string | null; avatar_url: string | null; city: string | null; bio: string | null;
  favorite_game_ids: string[]; visibility: PlayerProfile["visibility"]; deletion_scheduled_at: Date | null;
  steam_id: string | null; persona_name: string | null; steam_avatar_url: string | null; profile_url: string | null;
  is_public: boolean | null; playtime_minutes: number | null; synced_at: Date | null;
  completed_bookings: string; club_hours: string; tournaments: string; matches: string; wins: string;
}

@Injectable()
export class ProfilesService {
  private readonly memory = new Map<string, PlayerProfile>();
  private readonly deletionDates = new Map<string, string>();
  constructor(private readonly database: DatabaseService) {}

  async get(userId: string, viewerId?: string): Promise<PlayerProfile> {
    if (!this.database.configured) {
      const profile = this.memory.get(userId);
      if (!profile) throw new NotFoundException("Profile not found");
      return this.applyVisibility(profile, viewerId === userId);
    }
    const result = await this.database.query<ProfileRow>(`
      SELECT u.id,u.name,u.nickname,u.avatar_url,u.city,u.bio,u.favorite_game_ids,u.visibility,u.deletion_scheduled_at,
        s.steam_id,s.persona_name,s.avatar_url steam_avatar_url,s.profile_url,s.is_public,s.playtime_minutes,s.synced_at,
        (SELECT COUNT(*) FROM bookings b WHERE b.user_id=u.id AND b.status='completed') completed_bookings,
        (SELECT COALESCE(SUM(b.duration_hours),0) FROM bookings b WHERE b.user_id=u.id AND b.status='completed') club_hours,
        (SELECT COUNT(*) FROM tournament_registrations tr WHERE tr.user_id=u.id AND tr.status='approved') tournaments,
        (SELECT COUNT(*) FROM tournament_matches tm WHERE tm.status='completed' AND (tm.participant_a_id=u.id OR tm.participant_b_id=u.id)) matches,
        (SELECT COUNT(*) FROM tournament_matches tm WHERE tm.winner_id=u.id) wins
      FROM users u LEFT JOIN steam_connections s ON s.user_id=u.id
      WHERE u.id=$1 AND u.deleted_at IS NULL`, [userId]);
    if (!result.rows[0]) throw new NotFoundException("Profile not found");
    return this.applyVisibility(this.map(result.rows[0]), viewerId === userId);
  }

  async ensure(user: AuthUser): Promise<PlayerProfile> {
    if (this.database.configured) return this.get(user.id, user.id);
    const existing = this.memory.get(user.id);
    if (existing) return existing;
    const created: PlayerProfile = { id:user.id, name:user.name, nickname:`player-${user.id.slice(0,6)}`, favoriteGameIds:[], visibility:{city:true,steam:true,analytics:true}, analytics:{completedBookings:0,clubHours:0,tournaments:0,matches:0,wins:0,podiums:0} };
    this.memory.set(user.id, created); return created;
  }

  async update(user: AuthUser, request: UpdateProfileRequest): Promise<PlayerProfile> {
    if (request.nickname && !/^[a-zA-Z0-9_а-яА-ЯёЁ-]{3,24}$/.test(request.nickname)) throw new BadRequestException("Nickname must contain 3-24 safe characters");
    if ((request.bio?.length ?? 0) > 300) throw new BadRequestException("Bio is too long");
    if (!this.database.configured) {
      const current = await this.ensure(user); const updated = { ...current, ...request, visibility:{...current.visibility,...request.visibility} };
      this.memory.set(user.id, updated); return updated;
    }
    try {
      await this.database.query(`UPDATE users SET nickname=COALESCE($2,nickname),avatar_url=COALESCE($3,avatar_url),city=COALESCE($4,city),bio=COALESCE($5,bio),favorite_game_ids=COALESCE($6,favorite_game_ids),visibility=visibility || COALESCE($7::jsonb,'{}'),updated_at=NOW() WHERE id=$1`, [user.id,request.nickname,request.avatarUrl,request.city,request.bio,request.favoriteGameIds,JSON.stringify(request.visibility ?? {})]);
    } catch (error) { if ((error as {code?:string}).code === "23505") throw new ConflictException("Nickname is already used"); throw error; }
    return this.get(user.id,user.id);
  }

  steamConnectUrl(userId: string): { url: string } {
    const returnTo = process.env.STEAM_RETURN_URL ?? "http://localhost:4000/api/integrations/steam/callback";
    const state = `${userId}.${this.sign(userId)}`;
    const query = new URLSearchParams({"openid.ns":"http://specs.openid.net/auth/2.0","openid.mode":"checkid_setup","openid.return_to":`${returnTo}?state=${encodeURIComponent(state)}`,"openid.realm":new URL(returnTo).origin,"openid.identity":"http://specs.openid.net/auth/2.0/identifier_select","openid.claimed_id":"http://specs.openid.net/auth/2.0/identifier_select"});
    return { url:`https://steamcommunity.com/openid/login?${query}` };
  }

  async completeSteamConnection(state:string, openid:Record<string,string>):Promise<{connected:true;steamId:string}>{
    const split=state.lastIndexOf("."),userId=state.slice(0,split),signature=state.slice(split+1);
    if(!userId||signature!==this.sign(userId))throw new BadRequestException("Invalid Steam connection state");
    const claimed=openid["openid.claimed_id"]??"";const match=claimed.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
    if(!match)throw new BadRequestException("Invalid Steam identity");
    const verificationValues={...openid};delete verificationValues.state;const verification=new URLSearchParams({...verificationValues,"openid.mode":"check_authentication"});
    const checked=await fetch("https://steamcommunity.com/openid/login",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:verification});
    if(!checked.ok||!(await checked.text()).includes("is_valid:true"))throw new BadRequestException("Steam verification failed");
    const steamId=match[1],key=process.env.STEAM_WEB_API_KEY;let persona:{personaname?:string;avatarfull?:string;profileurl?:string;communityvisibilitystate?:number}={};
    if(key){const response=await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${steamId}`);if(response.ok){const json=await response.json() as {response:{players:typeof persona[]}};persona=json.response.players[0]??{};}}
    if(!this.database.configured){const profile=await this.get(userId,userId);profile.steam={steamId,personaName:persona.personaname,avatarUrl:persona.avatarfull,profileUrl:persona.profileurl,isPublic:persona.communityvisibilitystate===3,syncedAt:new Date().toISOString()};this.memory.set(userId,profile);return{connected:true,steamId};}
    try{await this.database.query(`INSERT INTO steam_connections(user_id,steam_id,persona_name,avatar_url,profile_url,is_public,raw_public_data,synced_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT(user_id) DO UPDATE SET steam_id=EXCLUDED.steam_id,persona_name=EXCLUDED.persona_name,avatar_url=EXCLUDED.avatar_url,profile_url=EXCLUDED.profile_url,is_public=EXCLUDED.is_public,raw_public_data=EXCLUDED.raw_public_data,synced_at=NOW()`,[userId,steamId,persona.personaname??null,persona.avatarfull??null,persona.profileurl??null,persona.communityvisibilitystate===3,JSON.stringify(persona)]);}catch(error){if((error as{code?:string}).code==="23505")throw new ConflictException("Steam account is already connected");throw error;}return{connected:true,steamId};
  }

  async requestDeletion(userId: string): Promise<{ deletionScheduledAt: string }> {
    const date = new Date(Date.now()+7*86400000).toISOString();
    if (this.database.configured) await this.database.query("UPDATE users SET deletion_scheduled_at=$2 WHERE id=$1",[userId,date]); else this.deletionDates.set(userId,date);
    return { deletionScheduledAt:date };
  }
  async cancelDeletion(userId: string): Promise<void> { if (this.database.configured) await this.database.query("UPDATE users SET deletion_scheduled_at=NULL WHERE id=$1 AND deleted_at IS NULL",[userId]); else this.deletionDates.delete(userId); }
  async purgeExpired(): Promise<{ purged:number }> {
    if (!this.database.configured) return {purged:0};
    const result = await this.database.query(`UPDATE users SET phone='deleted-'||id,nickname=NULL,avatar_url=NULL,city=NULL,bio=NULL,favorite_game_ids='{}',deleted_at=NOW(),deletion_scheduled_at=NULL WHERE deletion_scheduled_at<=NOW() AND deleted_at IS NULL RETURNING id`);
    return {purged:result.rowCount ?? 0};
  }
  private sign(value:string):string { return createHmac("sha256",process.env.AUTH_SECRET ?? "oyna-local-development-secret-change-me").update(value).digest("base64url"); }
  private map(row:ProfileRow):PlayerProfile { return {id:row.id,name:row.name,nickname:row.nickname ?? `player-${row.id.slice(0,6)}`,avatarUrl:row.avatar_url ?? undefined,city:row.city ?? undefined,bio:row.bio ?? undefined,favoriteGameIds:row.favorite_game_ids,visibility:row.visibility,steam:row.steam_id?{steamId:row.steam_id,personaName:row.persona_name??undefined,avatarUrl:row.steam_avatar_url??undefined,profileUrl:row.profile_url??undefined,isPublic:row.is_public??false,playtimeMinutes:row.playtime_minutes??undefined,syncedAt:row.synced_at?.toISOString()}:undefined,analytics:{completedBookings:Number(row.completed_bookings),clubHours:Number(row.club_hours),tournaments:Number(row.tournaments),matches:Number(row.matches),wins:Number(row.wins),podiums:0}}; }
  private applyVisibility(profile:PlayerProfile, own:boolean):PlayerProfile { if(own)return profile; return {...profile,city:profile.visibility.city?profile.city:undefined,steam:profile.visibility.steam?profile.steam:undefined,analytics:profile.visibility.analytics?profile.analytics:{completedBookings:0,clubHours:0,tournaments:0,matches:0,wins:0,podiums:0}}; }
}
