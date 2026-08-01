import { ServiceUnavailableException } from "@nestjs/common";
import type { ClubProviderCapabilities } from "./club-provider";

/**
 * Contract boundary for a future SENET partner API.
 * Endpoints are intentionally not guessed: they must be mapped from partner documentation.
 */
export class SenetProvider {
  readonly name = "senet" as const;

  getCapabilities(): ClubProviderCapabilities {
    return { liveAvailability: true, createBooking: true, cancelBooking: true, webhooks: true };
  }

  getConfiguration(): { apiUrl: string; token: string } {
    const apiUrl = process.env.SENET_API_URL;
    const token = process.env.SENET_API_TOKEN;
    if (!apiUrl || !token) throw new ServiceUnavailableException("SENET partner credentials are not configured");
    return { apiUrl, token };
  }
}

