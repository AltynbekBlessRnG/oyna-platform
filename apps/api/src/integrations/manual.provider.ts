import type { ClubProvider, ClubProviderCapabilities } from "./club-provider";

export class ManualClubProvider implements Pick<ClubProvider, "name" | "getCapabilities"> {
  readonly name = "manual" as const;

  getCapabilities(): ClubProviderCapabilities {
    return { liveAvailability: false, createBooking: false, cancelBooking: false, webhooks: false };
  }
}

