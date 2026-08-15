import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common"; import type { AuthUser } from "@oyna/contracts"; import { AuthGuard } from "../auth/auth.guard"; import { CurrentUser } from "../auth/current-user.decorator"; import { ChatService } from "./chat.service";
@Controller() @UseGuards(AuthGuard) export class ChatController {constructor(private readonly chat:ChatService){}
@Get("games")games(){return this.chat.games()} @Get("chat/channels")channels(@Query("city")c?:string){return this.chat.channels(c)}
@Get("chat/channels/:id/messages")messages(@Param("id")id:string,@CurrentUser()u:AuthUser,@Query("cursor")c?:string){return this.chat.list(id,u.id,c)}
@Post("chat/channels/:id/messages")send(@Param("id")id:string,@CurrentUser()u:AuthUser,@Body()b:{text:string;replyToId?:string;imageUrl?:string}){return this.chat.create(id,u,b)}
@Delete("chat/messages/:id")remove(@Param("id")id:string,@CurrentUser()u:AuthUser){return this.chat.remove(id,u)}
@Post("chat/messages/:id/report")report(@Param("id")id:string,@CurrentUser()u:AuthUser,@Body()b:{category:string;comment?:string}){return this.chat.report(id,u.id,b)}
@Post("users/:id/block")block(@Param("id")id:string,@CurrentUser()u:AuthUser){return this.chat.block(u.id,id,true)} @Delete("users/:id/block")unblock(@Param("id")id:string,@CurrentUser()u:AuthUser){return this.chat.block(u.id,id,false)}}
