import { useProgress } from "@react-three/drei";
import { MatchHeader } from "./MatchHeader";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";

import { Skybox, SkyboxLights, vipView, worldPoint } from "./scene/Skybox";
import { TicketCard } from "./TicketCard";
import { BlockSeats } from "./scene/BlockSeats";
import { SeatPreview } from "./scene/SeatPreview";
import type { MockDataSource } from "./venue/dataSource";
import { checkoutPayload, embedBridge, seatPayload } from "./embed/bridge";
import { ProceduralShell } from "./scene/ProceduralShell";
import type { Block, Seat } from "./venue/generateBowl";
import { Stand } from "./scene/Stand";
import { money } from "./venue/format";
import { MatchNight, Perimeter } from "./scene/MatchNight";
import "./overview.css";
import { DesktopGate } from "./notices";
import { Bowl } from "./scene/Bowl";
import { Shell, useShellBounds } from "./scene/Shell";
import { Stage } from "./scene/Stage";
import { generateBowl } from "./venue/generateBowl";
import { type VenueConfig } from "./venue/schema";

/** Full-screen until the first frame, then a slim bar while the shell GLB streams in. */
// Keeps the lit perimeter outside the model, which reaches past the seating.
function ShellPerimeter({
  venue,
  shell,
}: {
  venue: VenueConfig;
  shell: NonNullable<VenueConfig["shell"]>;
}) {
  return <Perimeter venue={venue} clear={useShellBounds(shell)} />;
}

function Loading({ ready, name }: { ready: boolean; name: string }) {
  const { active, progress } = useProgress();
  const percent = Math.round(progress);
  if (!ready)
    return (
      <div className="loading" role="status">
        <span className="spinner" aria-hidden="true" />
        <strong>{name}</strong>
        <span>Preparing the 3D view…</span>
      </div>
    );
  if (!active || percent >= 100) return null;
  return (
    <div className="loading-bar" role="status">
      <span>Loading stadium model · {percent}%</span>
      <progress
        max={100}
        value={percent}
        aria-label="Loading the stadium model"
      />
    </div>
  );
}

type VipState = { boxId: string; index: number | null; enter?: boolean };

/** Lets the host tell repeated checkouts apart; the latest one wins. */
const newCheckoutId = () =>
  // randomUUID needs a secure context; plain-HTTP LAN previews fall back.
  crypto.randomUUID?.() ??
  Date.now().toString(36) + Math.random().toString(36).slice(2);

export async function renderStadium(
  venue: VenueConfig,
  source: MockDataSource,
) {
  const bowl = generateBowl(venue);
  const [availability, ...boxes] = await Promise.all([
    source.getAvailability(venue.event.id, bowl),
    ...venue.vipBoxes.map((box) =>
      source.getVipAvailability(venue.event.id, box.id),
    ),
  ]);
  const vipAvailable = Object.fromEntries(
    venue.vipBoxes.map((box, i) => [box.id, boxes[i]]),
  );
  const sold = new Set(
    [...availability]
      .filter(([, status]) => status === "sold")
      .map(([id]) => id),
  );
  return (
    <DesktopGate>
      <Stadium
        venue={venue}
        bowl={bowl}
        sold={sold}
        vipAvailable={vipAvailable}
      />
    </DesktopGate>
  );
}

function Stadium({
  venue,
  bowl,
  sold,
  vipAvailable,
}: {
  venue: VenueConfig;
  bowl: ReturnType<typeof generateBowl>;
  sold: Set<string>;
  /** Free seats per VIP box, by box ID. */
  vipAvailable: Record<string, boolean[]>;
}) {
  const [query] = useState(() => new URLSearchParams(location.search));
  const [ready, setReady] = useState(false);
  const stats = useRef<HTMLSpanElement>(null);
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
  const [vip, setVip] = useState<VipState | null>(() => {
    const boxId = query.get("box");
    if (!selected || !boxId || !vipAvailable[boxId]) return null;
    const value = query.get("vipSeat");
    const index = value && /^\d+$/.test(value) ? Number(value) : null;
    return {
      boxId,
      index: index !== null && vipAvailable[boxId][index] ? index : null,
    };
  });
  // Never restored from the URL: a confirmation must follow a real checkout.
  const [done, setDone] = useState(false);
  const [vipSnapshot, setVipSnapshot] = useState("");
  // Snapshots are blob: URLs (SeatPreview); free each one once it's replaced.
  useEffect(() => () => URL.revokeObjectURL(snapshot), [snapshot]);
  useEffect(() => () => URL.revokeObjectURL(vipSnapshot), [vipSnapshot]);
  const box = vip ? venue.vipBoxes.find((b) => b.id === vip.boxId) : undefined;
  const boxAvailable = box ? vipAvailable[box.id] : [];
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
      box: vip?.boxId,
      vipSeat: vip?.index,
      // Older links may still carry it; drop it.
      done: undefined,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value == null) url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }
    history.replaceState(history.state, "", url);
  }, [block, selected, vip]);
  useEffect(() => {
    const unsubscribe = bridge?.onReset(() => {
      setBlock(null);
      setSeat(null);
      setSelected(null);
      setDone(false);
      setSnapshot("");
      setVipSnapshot("");
      setVip(null);
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
  const nearbyIds = useMemo(() => new Set(nearby.map((b) => b.id)), [nearby]);
  function back() {
    if (done) setDone(false);
    else if (vip)
      changeVip(vip.index === null ? null : { boxId: vip.boxId, index: null });
    else if (selected) {
      setSelected(null);
      setSnapshot("");
    } else setBlock(null);
    setSeat(null);
    setHover(null);
  }
  const onEscape = useEffectEvent(back);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  const shown = selected ?? seat;
  const tag = useRef<HTMLOutputElement>(null);
  const active = groups.find((group) => group.stand.id === hover);
  const standPrices = active?.blocks
    .filter((b) => left.has(b.id))
    .map((b) => venue.pricing.tiers[b.tierId][b.standId]);
  const standFrom = standPrices?.length ? Math.min(...standPrices) : null;
  const vipLeft = venue.vipBoxes.some((b) => vipAvailable[b.id].some(Boolean));
  /** The box nearest the chosen seat that still has a free seat. */
  function nearestBox(seat: Seat) {
    const [x, , z] = seat.position;
    return venue.vipBoxes
      .filter((b) => vipAvailable[b.id].some(Boolean))
      .sort(
        (a, b) =>
          Math.hypot(a.position[0] - x, a.position[2] - z) -
          Math.hypot(b.position[0] - x, b.position[2] - z),
      )[0];
  }
  const phase = done
    ? "done"
    : vip
      ? vip.index === null
        ? "vip"
        : "vip-seat"
      : selected
        ? "seat"
        : block
          ? "block"
          : "overview";
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
        seat={done ? null : (view ?? selected)}
        entry={entry}
        duration={view ? 0.8 : undefined}
        blockPose={done ? undefined : block?.flyIn}
        stats={query.has("debug") ? stats : undefined}
        onReady={() => setReady(true)}
      >
        <MatchNight venue={venue} />
        {venue.shell ? (
          <Suspense fallback={null}>
            <Shell
              accent={venue.branding.accent}
              opening={box}
              shell={venue.shell}
            />
            <ShellPerimeter venue={venue} shell={venue.shell} />
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
        {venue.vipBoxes.length > 0 && (
          // Mounted from the start so entering a box doesn't change the scene's
          // light count, which would recompile every lit material.
          <SkyboxLights box={box ?? venue.vipBoxes[0]} on={!!box} />
        )}
        {vip && box && (
          <Skybox
            box={box}
            available={boxAvailable}
            accent={venue.branding.accent}
            index={vip.index}
            pick={(index) => changeVip({ ...vip, index, enter: false })}
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
        <Bowl bowl={bowl} hidden={nearbyIds} accent={venue.branding.accent} />
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
      <MatchHeader venue={venue} />
      <output ref={tag} hidden={!active || !!block} className="stand-tag">
        {active && (
          <>
            <small>From</small>
            <strong>{active.stand.label}</strong>
            <span style={{ color: venue.branding.accent }}>
              {standFrom === null ? "Sold out" : money(venue, standFrom)}
            </span>
          </>
        )}
      </output>
      {block && (
        <section className="block-panel">
          <button onClick={back}>Back</button>
          <strong>Block {block.id}</strong>
          <span>
            {left.get(block.id)
              ? `${left.get(block.id)} left · ` +
                money(venue, venue.pricing.tiers[block.tierId][block.standId])
              : "Sold out · try a neighbouring block"}
          </span>
        </section>
      )}
      {selected && (
        <TicketCard
          venue={venue}
          seat={selected}
          snapshot={vip ? vipSnapshot : snapshot}
          vip={vip}
          box={box}
          upgrade={() => {
            const next = nearestBox(selected);
            if (next) changeVip({ boxId: next.id, index: null, enter: true });
          }}
          switchBox={(boxId) => changeVip({ boxId, index: null, enter: true })}
          standard={() => changeVip(null)}
          pick={(index) => vip && changeVip({ ...vip, index, enter: false })}
          embedded={!!bridge}
          available={vipAvailable}
          vipLeft={vipLeft}
          done={done}
          keep={() => {
            bridge?.send(
              "checkout",
              checkoutPayload(
                venue,
                selected,
                vip && vip.index !== null
                  ? { boxId: vip.boxId, index: vip.index }
                  : null,
                newCheckoutId(),
              ),
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
      <Loading ready={ready} name={venue.name} />
      {query.has("debug") && (
        <pre className="debug" aria-label="Debug stats">
          <span ref={stats}>…</span>
          {"\n"}phase {phase} · stand {hover ?? "–"} · block {block?.id ?? "–"}{" "}
          · seat {(selected ?? seat)?.id ?? "–"}
          {vip ? ` · vip ${vip.index ?? "–"}` : ""}
        </pre>
      )}
    </main>
  );
}
