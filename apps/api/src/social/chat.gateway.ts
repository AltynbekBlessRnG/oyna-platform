import { ConnectedSocket,MessageBody,OnGatewayConnection,SubscribeMessage,WebSocketGateway,WebSocketServer } from "@nestjs/websockets";import type { AuthUser } from "@oyna/contracts";import type { Server,Socket } from "socket.io";import { AuthService } from "../auth/auth.service";import { ChatService } from "./chat.service";
type AuthSocket=Socket&{data:{user?:AuthUser}};
@WebSocketGateway({namespace:"chat",cors:{origin:true}}) export class ChatGateway implements OnGatewayConnection{
 @WebSocketServer()server:Server;constructor(private readonly auth:AuthService,private readonly chat:ChatService){}
 handleConnection(client:AuthSocket){try{const token=String(client.handshake.auth.token??"");client.data.user=this.auth.verifyToken(token);}catch{client.disconnect(true)}}
 @SubscribeMessage("channel:join")join(@ConnectedSocket()c:AuthSocket,@MessageBody()b:{channelId:string}){void c.join(`channel:${b.channelId}`)}
 @SubscribeMessage("channel:leave")leave(@ConnectedSocket()c:AuthSocket,@MessageBody()b:{channelId:string}){void c.leave(`channel:${b.channelId}`)}
 @SubscribeMessage("message:send")async send(@ConnectedSocket()c:AuthSocket,@MessageBody()b:{channelId:string;text:string;replyToId?:string;imageUrl?:string}){const message=await this.chat.create(b.channelId,c.data.user!,b);this.server.to(`channel:${b.channelId}`).emit("message:created",message);return message;}
}
