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

/** ID of seat `index` (0-based) in a VIP box, e.g. `east-box-S3`. */
export const vipSeatId = (boxId: string, index: number) =>
  `${boxId}-S${index + 1}`;

/**
 * The `checkout` message. A VIP checkout describes the VIP seat only: it
 * carries none of the standard seat's block, row, seat, stand or gate, so a
 * host can't book both. Each checkout has its own `checkoutId`; the latest
 * one replaces any earlier checkout from the same session.
 */
export function checkoutPayload(
  venue: VenueConfig,
  seat: Seat,
  vip: { boxId: string; index: number } | null,
  checkoutId: string,
) {
  if (!vip) return { ...seatPayload(venue, seat), vip: false, checkoutId };
  return {
    venueId: venue.id,
    eventId: venue.event.id,
    seatId: vipSeatId(vip.boxId, vip.index),
    vip: true,
    boxId: vip.boxId,
    vipSeatIndex: vip.index,
    price: venue.pricing.vip.pricePerSeat,
    currency: venue.currency,
    checkoutId,
  };
}

type Message = { type: "ready" | "seatSelected" | "checkout"; payload: object };

/** Origins this app may post to: the venue's allowlist plus its own origin. */
export function allowedOrigins(venue: VenueConfig, self = location.origin) {
  return new Set([...venue.embed.allowedOrigins, self]);
}

/**
 * Talks to the host page when the app runs in `embed.js`'s iframe. The
 * parent's origin comes from `location.ancestorOrigins` or the referrer when
 * the browser exposes them; otherwise (Firefox with a `no-referrer` host, for
 * instance) from a `hello` handshake with `embed.js`, whose origin the browser
 * vouches for. Messages wait in a queue until the origin is known.
 */
export function embedBridge(venue: VenueConfig) {
  const query = new URLSearchParams(location.search);
  if (query.get("embed") !== "1" || window.parent === window) return null;
  const allowed = allowedOrigins(venue);
  const referrer = URL.canParse(document.referrer)
    ? new URL(document.referrer).origin
    : undefined;
  const candidates = [location.ancestorOrigins?.[0], referrer];
  let origin = candidates.find((o) => o && allowed.has(o)) ?? null;
  const queue: Message[] = [];
  const resets = new Set<() => void>();
  const post = (message: Message | { type: "hello" }) =>
    window.parent.postMessage(message, origin!);

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    if (!allowed.has(event.origin)) {
      console.warn(
        `Stadium embed: ${event.origin} is not in this venue's embed.allowedOrigins`,
      );
      return;
    }
    if (!origin && event.data?.type === "hello") {
      origin = event.origin;
      for (const message of queue.splice(0)) post(message);
    }
    if (event.origin === origin && event.data?.type === "reset")
      for (const reset of resets) reset();
  });
  // Nothing but the type goes out to an unknown parent; embed.js answers with
  // its own `hello`, posted from the host's origin.
  if (!origin) window.parent.postMessage({ type: "hello" }, "*");
  const declared = candidates.find(Boolean);
  if (declared && !allowed.has(declared))
    console.warn(
      `Stadium embed: ${declared} is not in this venue's embed.allowedOrigins`,
    );

  return {
    send(type: Message["type"], payload: object) {
      if (origin) post({ type, payload });
      else queue.push({ type, payload });
    },
    onReset(reset: () => void) {
      resets.add(reset);
      return () => void resets.delete(reset);
    },
  };
}
