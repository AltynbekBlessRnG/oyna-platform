import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { AuthUser, ClubAccount, ClubOrder, ClubSummary, CreateOrderRequest, MenuItem } from "@oyna/contracts";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ClubHallService } from "./club-hall.service";
import { ClubsService } from "./clubs.service";

@Controller("clubs")
export class ClubsController {
  constructor(
    private readonly clubsService: ClubsService,
    private readonly hallService: ClubHallService
  ) {}

  @Get()
  findAll(): Promise<ClubSummary[]> {
    return this.clubsService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<ClubSummary> {
    return this.clubsService.findOne(id);
  }

  @Get(":id/menu")
  findMenu(@Param("id") id: string): Promise<MenuItem[]> {
    return this.hallService.findMenu(id);
  }

  @Post(":id/orders")
  @UseGuards(AuthGuard)
  createOrder(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() request: CreateOrderRequest): Promise<ClubOrder> {
    return this.hallService.createOrder(id, user, request);
  }

  @Get(":id/orders")
  @UseGuards(AuthGuard)
  findMyOrders(@Param("id") id: string, @CurrentUser() user: AuthUser): Promise<ClubOrder[]> {
    return this.hallService.findMyOrders(id, user.id);
  }

  @Get(":id/account")
  @UseGuards(AuthGuard)
  getAccount(@Param("id") id: string, @CurrentUser() user: AuthUser): Promise<ClubAccount> {
    return this.hallService.getAccount(id, user);
  }

  @Patch(":id/account")
  @UseGuards(AuthGuard)
  renameAccount(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() body: { nickname: string }): Promise<ClubAccount> {
    return this.hallService.renameAccount(id, user, body.nickname);
  }
}
