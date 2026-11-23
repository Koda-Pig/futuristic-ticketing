import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { z } from "zod";

import { Skybox, vipView, worldPoint } from "./scene/Skybox";
import { Crowd } from "./scene/Crowd";
import { TicketCard } from "./TicketCard";
import { BlockSeats } from "./scene/BlockSeats";
import { SeatPreview } from "./scene/SeatPreview";
import { MockDataSource } from "./venue/dataSource";
import { embedBridge, seatPayload } from "./embed/bridge";
import { ProceduralShell } from "./scene/ProceduralShell";
import type { Block, Seat } from "./venue/generateBowl";
import { Stand } from "./scene/Stand";
import { kickoff, money } from "./venue/format";
import { MatchNight } from "./scene/MatchNight";
import "./overview.css";
import { Bowl } from "./scene/Bowl";
import { Shell } from "./scene/Shell";
import { Stage } from "./scene/Stage";
import { generateBowl } from "./venue/generateBowl";
import { type VenueConfig } from "./venue/schema";

const source = new MockDataSource();
/** Loads the venue, then renders `render(venue)` or a developer error. */
export async function mountVenue(
  root: HTMLElement,
  render: (venue: VenueConfig) => React.ReactNode | Promise<React.ReactNode>,
) {
  const reactRoot = createRoot(root);
  try {
    const query = new URLSearchParams(location.search);
    const venue = await source.getVenue(query.get("venue") ?? "cape-point");
    if (query.has("event") && query.get("event") !== venue.event.id)
      throw new Error("Unknown event");
    document.title = query.has("calibrate")
      ? venue.name + " · Calibrate"
      : venue.name;
    reactRoot.render(await render(venue));
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
}

export const mount = (root: HTMLElement) =>
  mountVenue(root, async (venue) => {
    const bowl = generateBowl(venue);
    const box = venue.vipBoxes[0];
    const [availability, vipAvailable] = await Promise.all([
      source.getAvailability(venue.event.id, bowl),
      box
        ? source.getVipAvailability(venue.event.id, box.id)
        : Promise.resolve([]),
    ]);
    const sold = new Set(
      [...availability]
        .filter(([, status]) => status === "sold")
        .map(([id]) => id),
    );
    return (
      <Stadium
        venue={venue}
        bowl={bowl}
        sold={sold}
        vipAvailable={vipAvailable}
      />
    );
  });

function Stadium({
  venue,
  bowl,
  sold,
  vipAvailable,
}: {
  venue: VenueConfig;
  bowl: ReturnType<typeof generateBowl>;
  sold: Set<string>;
  vipAvailable: boolean[];
}) {
  const [query] = useState(() => new URLSearchParams(location.search));
  const [bridge] = useState(() => embedBridge(venue));
  const initialSeat =
    bowl.seats[bowl.seatIndexById.get(query.get("seat") ?? "") ?? -1];
  const initialBlock = bowl.blocks.find(
    (b) => b.id === (query.get("block") ?? initialSeat?.blockId),
  );
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
  const [block, setBlock] = useState<Block | null>(initialBlock ?? null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [selected, setSelected] = useState<Seat | null>(
    initialSeat &&
      initialBlock?.id === initialSeat.blockId &&
      !sold.has(initialSeat.id)
      ? initialSeat
      : null,
  );
  const [snapshot, setSnapshot] = useState("");

  // `enter` is set only on the upgrade, so going back to the picker from a
  // chosen VIP seat doesn't replay the fly-in from outside the box.
  const [vip, setVip] = useState<{
    index: number | null;
    enter?: boolean;
  } | null>(() => {
    if (
      !selected ||
      !venue.vipBoxes[0] ||
      query.get("box") !== venue.vipBoxes[0].id
    )
      return null;
    const value = query.get("vipSeat");
    const index = value && /^\d+$/.test(value) ? Number(value) : null;
    return { index: index !== null && vipAvailable[index] ? index : null };
  });
  const [done, setDone] = useState(
    !!selected &&
      query.get("done") === "1" &&
      (!query.has("box") || (vip !== null && vip.index !== null)),
  );
  const [vipSnapshot, setVipSnapshot] = useState("");
  const box = venue.vipBoxes[0];
  const view = useMemo(
    () => (vip && box ? vipView(box, vip.index) : null),
    [vip, box],
  );
  const entry = useMemo(
    () =>
      vip?.enter && box
        ? worldPoint(box, [0, 2, box.size[2] / 2 + 5])
        : undefined,
    [vip, box],
  );
  function changeVip(next: typeof vip) {
    setVipSnapshot("");
    setVip(next);
  }
  const [rejections, reject] = useState(0);
  const preview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const url = new URL(location.href);
    const values = {
      block: block?.id,
      seat: selected?.id,
      box: vip ? box?.id : undefined,
      vipSeat: vip?.index,
      done: done ? 1 : undefined,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value == null) url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }
    history.replaceState(history.state, "", url);
  }, [block, selected, vip, box, done]);
  useEffect(() => {
    const unsubscribe = bridge?.onReset(() => {
      setBlock(null);
      setSeat(null);
      setSelected(null);
      setDone(false);
      setSnapshot("");
      changeVip(null);
      setHover(null);
      reject(0);
    });
    bridge?.send("ready", { venueId: venue.id, eventId: venue.event.id });
    return unsubscribe;
  }, [bridge, venue]);
  useEffect(() => {
    if (selected) bridge?.send("seatSelected", seatPayload(venue, selected));
  }, [bridge, selected, venue]);
  const left = useMemo(() => {
    const counts = new Map<string, number>();
    for (const seat of bowl.seats)
      if (!sold.has(seat.id))
        counts.set(seat.blockId, (counts.get(seat.blockId) ?? 0) + 1);
    return counts;
  }, [bowl, sold]);
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
    else if (vip) changeVip(vip.index === null ? null : { index: null });
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
  }, [selected, done, vip]);
  const shown = selected ?? seat;
  const tag = useRef<HTMLOutputElement>(null);
  const active = groups.find((group) => group.stand.id === hover);
  const { day, time } = kickoff(venue);
  return (
    <main
      className="overview"
      aria-label={venue.name}
      style={
        {
          "--accent": venue.branding.accent,
          "--accent-on": venue.branding.accentOn,
        } as React.CSSProperties
      }
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
      <Stage
        venue={venue}
        overview
        seat={view ?? selected}
        entry={entry}
        duration={view ? 0.8 : undefined}
        blockPose={block?.flyIn}
      >
        <MatchNight venue={venue} />
        {venue.shell ? (
          <Suspense fallback={null}>
            <Shell opening={vip ? box : undefined} shell={venue.shell} />
          </Suspense>
        ) : (
          <ProceduralShell bowl={bowl} />
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
        {vip && box && (
          <Skybox
            box={box}
            available={vipAvailable}
            accent={venue.branding.accent}
            index={vip.index}
            pick={(index) => changeVip({ index })}
          />
        )}
        {shown && (
          <SeatPreview
            seat={view ?? shown}
            canvas={preview}
            snapshot={
              view ? setVipSnapshot : selected ? setSnapshot : undefined
            }
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
                  ...active.blocks
                    .filter((b) => left.has(b.id))
                    .map((b) => venue.pricing.tiers[b.tierId][b.standId]),
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
          <span>
            {left.get(block.id) ?? 0} left ·{" "}
            {money(venue, venue.pricing.tiers[block.tierId][block.standId])}
          </span>
        </section>
      )}
      {selected && (
        <TicketCard
          venue={venue}
          seat={selected}
          snapshot={vip ? vipSnapshot : snapshot}
          vip={vip}
          upgrade={() => changeVip({ index: null, enter: true })}
          standard={() => changeVip(null)}
          pick={(index) => changeVip({ index })}
          embedded={!!bridge}
          available={vipAvailable}
          done={done}
          keep={() => {
            const payload = seatPayload(venue, selected);
            bridge?.send(
              "checkout",
              vip && vip.index !== null
                ? {
                    ...payload,
                    vip: true,
                    boxId: box.id,
                    vipSeatIndex: vip.index,
                    price: venue.pricing.vip.pricePerSeat,
                  }
                : { ...payload, vip: false },
            );
            setDone(true);
          }}
          choose={() => {
            changeVip(null);
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
