import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { z } from "zod";

import { Crowd } from "./scene/Crowd";
import { TicketCard } from "./TicketCard";
import { BlockSeats } from "./scene/BlockSeats";
import { SeatPreview } from "./scene/SeatPreview";
import { soldSeats } from "./venue/availability";
import type { Block, Seat } from "./venue/generateBowl";
import { Stand } from "./scene/Stand";
import { kickoff, money } from "./venue/format";
import { MatchNight } from "./scene/MatchNight";
import "./overview.css";
import { Bowl } from "./scene/Bowl";
import { Shell } from "./scene/Shell";
import { Stage } from "./scene/Stage";
import { generateBowl } from "./venue/generateBowl";
import { type VenueConfig, venueSchema } from "./venue/schema";

export const VENUE_URL = "/venues/cape-point/venue.json";

export async function loadVenue(url = VENUE_URL) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Venue request returned HTTP ${response.status}`);
  return venueSchema.parse(await response.json());
}

/** Loads the venue, then renders `render(venue)` or a developer error. */
export async function mountVenue(
  root: HTMLElement,
  render: (venue: VenueConfig) => React.ReactNode,
) {
  const reactRoot = createRoot(root);
  let venue: VenueConfig;
  try {
    venue = await loadVenue();
  } catch (error) {
    const message =
      error instanceof z.ZodError ? z.prettifyError(error) : String(error);
    reactRoot.render(
      <main role="alert">
        <h1>Could not load venue</h1>
        <pre>{message}</pre>
      </main>,
    );
    return;
  }
  reactRoot.render(render(venue));
}

export const mount = (root: HTMLElement) =>
  mountVenue(root, (venue) => <Stadium venue={venue} />);

function Stadium({ venue }: { venue: VenueConfig }) {
  const bowl = useMemo(() => generateBowl(venue), [venue]);
  const groups = useMemo(
    () =>
      venue.stands
        .map((stand) => ({
          stand,
          blocks: bowl.blocks.filter((b) => b.standId === stand.id),
        }))
        .filter((group) => group.blocks.length),
    [bowl, venue],
  );
  const [hover, setHover] = useState<string | null>(null);
  const [block, setBlock] = useState<Block | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [selected, setSelected] = useState<Seat | null>(null);
  const [snapshot, setSnapshot] = useState("");
  const [done, setDone] = useState(false);
  const [rejections, reject] = useState(0);
  const preview = useRef<HTMLCanvasElement>(null);
  const sold = useMemo(
    () => soldSeats(bowl, venue.availability),
    [bowl, venue],
  );
  const nearby = useMemo(() => {
    if (!block) return [];
    const tier = bowl.blocks.filter((b) => b.tierId === block.tierId);
    const i = tier.indexOf(block);
    return [
      ...new Set([
        block,
        tier[(i + 1) % tier.length],
        tier[(i + tier.length - 1) % tier.length],
      ]),
    ];
  }, [block, bowl]);
  const farBowl = useMemo(
    () =>
      nearby.length
        ? {
            ...bowl,
            seats: bowl.seats.filter(
              (s) => !nearby.some((b) => b.id === s.blockId),
            ),
          }
        : bowl,
    [bowl, nearby],
  );
  function back() {
    if (done) setDone(false);
    else if (selected) {
      setSelected(null);
      setSnapshot("");
    } else setBlock(null);
    setSeat(null);
    setHover(null);
  }
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") back();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [selected, done]);
  const shown = selected ?? seat;
  const tag = useRef<HTMLOutputElement>(null);
  const active = groups.find((group) => group.stand.id === hover);
  const { day, time } = kickoff(venue);
  return (
    <main
      className="overview"
      aria-label={venue.name}
      onPointerLeave={() => {
        setHover(null);
        setSeat(null);
      }}
      onPointerMove={(e) => {
        if (tag.current) {
          tag.current.style.left =
            Math.min(e.clientX + 16, innerWidth - 190) + "px";
          tag.current.style.top =
            Math.min(e.clientY + 16, innerHeight - 80) + "px";
        }
      }}
    >
      <Stage venue={venue} overview seat={selected} blockPose={block?.flyIn}>
        <MatchNight venue={venue} />
        {venue.shell && (
          <Suspense fallback={null}>
            <Shell shell={venue.shell} />
          </Suspense>
        )}
        {nearby.map((b) => (
          <BlockSeats
            key={b.id}
            block={b}
            bowl={bowl}
            accent={venue.branding.accent}
            sold={sold}
            hover={seat}
            selected={selected}
            interactive={b === block && !selected}
            onHover={setSeat}
            onPick={(s) => {
              setSeat(s);
              if (sold.has(s.id)) reject((n) => n + 1);
              else setSelected(s);
            }}
          />
        ))}
        {selected && sold.size > 0 && (
          <Crowd
            seats={bowl.seats}
            sold={sold}
            accent={venue.branding.accent}
          />
        )}
        {shown && (
          <SeatPreview
            seat={shown}
            canvas={preview}
            snapshot={selected ? setSnapshot : undefined}
          />
        )}
        <Bowl bowl={farBowl} accent={venue.branding.accent} />
        {groups.map(({ stand, blocks }) => (
          <Stand
            key={stand.id}
            venue={venue}
            blocks={blocks}
            active={stand.id === hover}
            onEnter={
              block
                ? undefined
                : (b) => {
                    setHover(null);
                    setBlock(b);
                  }
            }
            onHover={setHover}
          />
        ))}
      </Stage>
      <header
        className="matchbar"
        style={{ borderColor: venue.branding.accent }}
      >
        <strong>{venue.name}</strong>
        <h1>
          {venue.event.home} <small>vs</small> {venue.event.away}
        </h1>
        <time dateTime={venue.event.startsAt}>
          {day} · {time}
        </time>
      </header>
      <output ref={tag} hidden={!active || !!block} className="stand-tag">
        {active && (
          <>
            <small>From</small>
            <strong>{active.stand.label}</strong>
            <span style={{ color: venue.branding.accent }}>
              {money(
                venue,
                Math.min(
                  ...active.blocks.map(
                    (b) => venue.pricing.tiers[b.tierId][b.standId],
                  ),
                ),
              )}
            </span>
          </>
        )}
      </output>
      {block && (
        <section className="block-panel">
          <button onClick={back}>Back</button>
          <strong>Block {block.id}</strong>
        </section>
      )}
      {selected && (
        <TicketCard
          venue={venue}
          seat={selected}
          snapshot={snapshot}
          done={done}
          keep={() => setDone(true)}
          choose={() => {
            setDone(false);
            setSelected(null);
            setSeat(null);
            setSnapshot("");
          }}
        />
      )}
      {shown && !selected && (
        <section className="seat-tooltip" aria-label="Seat details">
          <canvas
            key={shown.id}
            width={320}
            height={180}
            ref={preview}
            aria-label="View from this seat"
          />
          <strong>
            Block {shown.blockId} · Row {shown.row} · Seat {shown.seat}
          </strong>
          <span>
            {money(venue, venue.pricing.tiers[shown.tierId][shown.standId])}
          </span>
          <span
            key={rejections}
            className={sold.has(shown.id) && rejections ? "taken" : undefined}
          >
            {sold.has(shown.id) ? "Taken" : "Available"}
          </span>
        </section>
      )}
      <footer>
        {selected && !done
          ? "Drag to look around · Esc to go back"
          : block
            ? "Esc to go back"
            : "Drag to orbit · Scroll to zoom · Click a block"}
      </footer>
      {venue.shell?.credit && <aside>{venue.shell.credit}</aside>}
    </main>
  );
}
