import type { Seat } from "../venue/generateBowl";
import type { VenueConfig } from "../venue/schema";

export function seatPayload(venue: VenueConfig, seat: Seat) {
  const tier = venue.tiers.find((t) => t.id === seat.tierId)!;
  return {
    venueId: venue.id,
    eventId: venue.event.id,
    seatId: seat.id,
    block: seat.blockId,
    row: seat.row,
    seat: seat.seat,
    tier: seat.tierId,
    stand: seat.standId,
    gate:
      tier.gateLetter +
      (venue.stands.findIndex((s) => s.id === seat.standId) + 1),
    price: venue.pricing.tiers[seat.tierId][seat.standId],
    currency: venue.currency,
  };
}

export function embedBridge(venue: VenueConfig) {
  const query = new URLSearchParams(location.search);
  const origin = URL.canParse(document.referrer)
    ? new URL(document.referrer).origin
    : null;
  if (query.get("embed") !== "1" || window.parent === window) return null;
  if (!origin || !venue.embed.allowedOrigins.includes(origin)) {
    if (query.has("debug"))
      console.warn("Embed parent is outside the venue allowlist");
    return null;
  }
  return {
    send(type: "ready" | "seatSelected" | "checkout", payload: object) {
      window.parent.postMessage({ type, payload }, origin);
    },
    onReset(reset: () => void) {
      const receive = (event: MessageEvent) => {
        if (
          event.origin === origin &&
          event.source === window.parent &&
          event.data?.type === "reset"
        )
          reset();
      };
      window.addEventListener("message", receive);
      return () => window.removeEventListener("message", receive);
    },
  };
}
