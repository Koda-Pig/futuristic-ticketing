import { kickoff } from "./venue/format";
import type { VenueConfig } from "./venue/schema";

export function MatchHeader({ venue }: { venue: VenueConfig }) {
  const { day, time } = kickoff(venue);
  return (
    <header className="matchbar" style={{ borderColor: venue.branding.accent }}>
      {venue.branding.logoUrl && (
        <img className="matchbar-logo" src={venue.branding.logoUrl} alt="" />
      )}
      <strong>{venue.name}</strong>
      <h1>
        {venue.event.home} <small>vs</small> {venue.event.away}
      </h1>
      <time dateTime={venue.event.startsAt}>
        {day} · {time}
      </time>
    </header>
  );
}
