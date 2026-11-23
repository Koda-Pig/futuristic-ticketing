import { mulberry32, soldSeats } from "./availability";
import type { Bowl } from "./generateBowl";
import { venueSchema, type VenueConfig } from "./schema";

type Status = "available" | "sold";

export interface DataSource {
  getVenue(id: string): Promise<VenueConfig>;
  getAvailability(eventId: string, bowl: Bowl): Promise<Map<string, Status>>;
  getVipAvailability(eventId: string, boxId: string): Promise<boolean[]>;
}

export class MockDataSource implements DataSource {
  private events = new Map<string, VenueConfig>();

  async getVenue(id: string) {
    if (!/^[a-z0-9-]+$/i.test(id)) throw new Error("Invalid venue ID");
    const response = await fetch(`/venues/${id}/venue.json`);
    if (!response.ok)
      throw new Error(`Venue request returned HTTP ${response.status}`);
    const venue = venueSchema.parse(await response.json());
    if (venue.id !== id) throw new Error("Venue ID mismatch");
    const previewOrigin = import.meta.env.EMBED_PREVIEW_ORIGIN;
    if (previewOrigin) venue.embed.allowedOrigins.push(previewOrigin);
    this.events.set(venue.event.id, venue);
    return venue;
  }

  private event(id: string) {
    const venue = this.events.get(id);
    if (!venue) throw new Error("Unknown event");
    return venue;
  }

  async getAvailability(eventId: string, bowl: Bowl) {
    const sold = soldSeats(bowl, this.event(eventId).availability);
    return new Map<string, Status>(
      bowl.seats.map((s) => [s.id, sold.has(s.id) ? "sold" : "available"]),
    );
  }

  async getVipAvailability(eventId: string, boxId: string) {
    const venue = this.event(eventId);
    const box = venue.vipBoxes.find((b) => b.id === boxId);
    if (!box) throw new Error("Unknown skybox");
    const seed = Array.from(boxId).reduce(
      (n, c) => Math.imul(n, 31) + c.charCodeAt(0),
      venue.availability.seed,
    );
    const random = mulberry32(seed);
    const indices = Array.from({ length: box.seats }, (_, i) => i);
    const sold = new Set<number>();
    const count = Math.min(box.seats - 1, 2 + Math.floor(random() * 3));
    while (sold.size < count)
      sold.add(indices.splice(Math.floor(random() * indices.length), 1)[0]);
    return Array.from({ length: box.seats }, (_, i) => !sold.has(i));
  }
}
