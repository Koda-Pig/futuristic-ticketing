import type { VipBox } from "./scene/Skybox";
import type { Seat } from "./venue/generateBowl";
import { money } from "./venue/format";
import type { VenueConfig } from "./venue/schema";

export function TicketCard({
  venue,
  available,
  vipLeft,
  embedded,
  seat,
  snapshot,
  done,
  keep,
  choose,
  vip,
  box,
  upgrade,
  switchBox,
  standard,
  pick,
}: {
  venue: VenueConfig;
  /** Free seats per VIP box, by box ID. */
  available: Record<string, boolean[]>;
  vipLeft: boolean;
  embedded: boolean;
  seat: Seat;
  snapshot: string;
  done: boolean;
  keep: () => void;
  choose: () => void;
  vip: { index: number | null } | null;
  /** The VIP box being viewed, when `vip` is set. */
  box?: VipBox;
  upgrade: () => void;
  switchBox: (boxId: string) => void;
  standard: () => void;
  pick: (index: number) => void;
}) {
  const standIndex = venue.stands.findIndex((s) => s.id === seat.standId);
  const tier = venue.tiers.find((t) => t.id === seat.tierId)!;
  const price = venue.pricing.tiers[seat.tierId][seat.standId];
  const bars = Array.from(seat.id, (c) =>
    c.charCodeAt(0).toString(2).padStart(8, "0"),
  ).join("");
  const vipPrice = venue.pricing.vip.pricePerSeat;
  if (vip && box)
    return (
      <section
        key="vip"
        className={"ticket vip" + (done ? " confirmed" : "")}
        aria-label={done ? "VIP confirmation" : "VIP ticket"}
      >
        {!done && (
          <figure>
            {snapshot && <img src={snapshot} alt="Pitch from the skybox" />}
            <figcaption>View from the box</figcaption>
          </figure>
        )}
        <div className="ticket-details">
          <span>VIP · Level {box.level}</span>
          <h2>{done ? "VIP seat confirmed" : box.label}</h2>
          <p>
            {done && box.label + " · "}
            {vip.index === null
              ? box.seats + " seats"
              : "Seat " + (vip.index + 1)}{" "}
            · Entry VIP
          </p>
          <strong>{money(venue, vipPrice)}</strong>
          {!done &&
            (vip.index === null ? (
              <>
                {venue.vipBoxes.length > 1 && (
                  <fieldset className="boxes">
                    <legend>Box</legend>
                    {venue.vipBoxes.map((b) => (
                      <button
                        key={b.id}
                        aria-pressed={b.id === box.id}
                        disabled={!available[b.id].some(Boolean)}
                        onClick={() => b.id !== box.id && switchBox(b.id)}
                      >
                        {b.label}
                      </button>
                    ))}
                  </fieldset>
                )}
                <fieldset>
                  <legend>Choose your VIP seat</legend>
                  {Array.from({ length: box.seats }, (_, i) => (
                    <button
                      key={i}
                      disabled={!available[box.id][i]}
                      aria-label={"VIP seat " + (i + 1)}
                      onClick={() => pick(i)}
                    >
                      {i + 1}
                    </button>
                  ))}
                </fieldset>
              </>
            ) : (
              <button className="upgrade" onClick={keep}>
                Confirm VIP
              </button>
            ))}
          {done && (
            <p>
              {embedded
                ? "Continuing to checkout…"
                : "Demo: checkout hands off to your ticketing provider."}
            </p>
          )}
          <button onClick={done ? choose : standard}>
            {done ? "Choose another seat" : "Back to standard seat"}
          </button>
        </div>
      </section>
    );
  return (
    <section
      key="standard"
      className={"ticket standard" + (done ? " confirmed" : "")}
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
          <p>
            {embedded
              ? "Continuing to checkout…"
              : "Demo: checkout hands off to your ticketing provider."}
          </p>
        ) : (
          <>
            {venue.vipBoxes.length > 0 && (
              <button className="upgrade" disabled={!vipLeft} onClick={upgrade}>
                {!vipLeft
                  ? "VIP sold out"
                  : vipPrice > price
                    ? "Upgrade · +" + money(venue, vipPrice - price)
                    : "Upgrade to VIP · " + money(venue, vipPrice)}
              </button>
            )}
            <button onClick={keep}>Keep my seat</button>
          </>
        )}
        <button onClick={choose}>Choose another seat</button>
      </div>
    </section>
  );
}
