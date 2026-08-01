import type { ClubSummary } from "@oyna/contracts";

export const demoClubs: ClubSummary[] = [
  { id: "vertex-arena", name: "Vertex Arena", address: "пр. Абая, 44", city: "Алматы", distanceKm: 1.2, rating: 4.9, reviewCount: 218, priceFrom: 900, availableSeats: 12, totalSeats: 60, status: "available", tags: ["24/7", "VIP", "Bootcamp"], equipment: "RTX 4070 · 240 Hz", accent: "#B8FF45" },
  { id: "qazaq-cyber", name: "Qazaq Cyber", address: "ул. Жандосова, 58", city: "Алматы", distanceKm: 2.7, rating: 4.8, reviewCount: 164, priceFrom: 700, availableSeats: 5, totalSeats: 42, status: "available", tags: ["PS5", "Парковка"], equipment: "RTX 4060 Ti · 180 Hz", accent: "#8B7CFF" },
  { id: "respawn-point", name: "Respawn Point", address: "ул. Толе би, 189", city: "Алматы", distanceKm: 3.4, rating: 4.7, reviewCount: 96, priceFrom: 600, availableSeats: 0, totalSeats: 35, status: "busy", tags: ["24/7", "Кухня"], equipment: "RTX 3060 · 165 Hz", accent: "#FF795C" }
];

