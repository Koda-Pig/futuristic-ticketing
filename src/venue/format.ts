import type { VenueConfig } from "./schema";

export function money(venue: VenueConfig, amount: number) {
  return amount.toLocaleString(venue.locale, {
    style: "currency",
    currency: venue.currency,
    maximumFractionDigits: 0,
  });
}

/** Kick-off as `Sat, Mar 14` and `17:00`, in the venue's own time zone. */
export function kickoff(venue: VenueConfig) {
  const at = venue.event.startsAt;
  // Format the calendar date alone so the viewer's time zone can't shift it.
  const day = new Intl.DateTimeFormat(venue.locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(at.slice(0, 10) + "T12:00:00Z"));
  return { day, time: at.slice(11, 16) };
}
