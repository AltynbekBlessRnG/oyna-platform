import type { AvailabilitySnapshot, BookingReceipt, ClubZone, CreateBookingRequest } from "@oyna/contracts";

export type ClubProviderName = "manual" | "senet" | "smartshell" | "langame";

export interface ClubProviderCapabilities {
  liveAvailability: boolean;
  createBooking: boolean;
  cancelBooking: boolean;
  webhooks: boolean;
}

export interface ClubProvider {
  readonly name: ClubProviderName;
  getCapabilities(): ClubProviderCapabilities;
  getZones(clubId: string): Promise<ClubZone[]>;
  getAvailability(clubId: string, zoneId: string, startAt: string, durationHours: number): Promise<AvailabilitySnapshot>;
  createBooking(request: CreateBookingRequest): Promise<BookingReceipt>;
  cancelBooking(externalId: string): Promise<void>;
}

