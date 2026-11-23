import type { Seat } from "./venue/generateBowl";
import { money } from "./venue/format";
import type { VenueConfig } from "./venue/schema";

export function TicketCard({
  venue,
  seat,
  snapshot,
  done,
  keep,
  choose,
}: {
  venue: VenueConfig;
  seat: Seat;
  snapshot: string;
  done: boolean;
  keep: () => void;
  choose: () => void;
}) {
  const standIndex = venue.stands.findIndex((s) => s.id === seat.standId);
  const tier = venue.tiers.find((t) => t.id === seat.tierId)!;
  const price = venue.pricing.tiers[seat.tierId][seat.standId];
  const bars = Array.from(seat.id, (c) =>
    c.charCodeAt(0).toString(2).padStart(8, "0"),
  ).join("");
  return (
    <section
      className={"ticket" + (done ? " confirmed" : "")}
      aria-label={done ? "Seat confirmation" : "Ticket"}
    >
      {!done && (
        <figure>
          {snapshot && (
            <img
              src={snapshot}
              alt="View of the pitch from your selected seat"
            />
          )}
          <figcaption>Your view</figcaption>
        </figure>
      )}
      <div className="ticket-details">
        {done && <h2>Seat confirmed</h2>}
        <span>
          {venue.stands[standIndex].label} · {tier.label}
        </span>
        <h2>Block {seat.blockId}</h2>
        <dl>
          {Object.entries({
            Row: seat.row,
            Seat: seat.seat,
            Gate: tier.gateLetter + (standIndex + 1),
          }).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="ticket-price">
          <svg
            aria-hidden="true"
            width="72"
            height="20"
            viewBox={"0 0 " + bars.length + " 20"}
            preserveAspectRatio="none"
          >
            {Array.from(
              bars,
              (v, i) =>
                v === "1" && <rect key={i} x={i} width="1" height="20" />,
            )}
          </svg>
          <strong>{money(venue, price)}</strong>
        </div>
        {done ? (
          <p>Demo: checkout hands off to your ticketing provider.</p>
        ) : (
          <>
            <button className="upgrade" disabled>
              Upgrade · +{money(venue, venue.pricing.vip.pricePerSeat - price)}
            </button>
            <button onClick={keep}>Keep my seat</button>
          </>
        )}
        <button onClick={choose}>Choose another seat</button>
      </div>
    </section>
  );
}
