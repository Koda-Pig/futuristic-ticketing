import { Component, type ReactNode, useState } from "react";

export function hasWebGL2() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

export function NoWebGL() {
  return (
    <main className="notice" role="alert">
      <h1>This experience needs a modern desktop browser</h1>
      <p>
        Open this page in a current version of Chrome, Edge, Firefox or Safari
        with hardware acceleration turned on.
      </p>
    </main>
  );
}

export const smallOrTouch = () =>
  matchMedia("(pointer: coarse)").matches || innerWidth < 900;

/** v1 is desktop-only (docs/PLAN.md §13); small or touch screens may still continue. */
export function DesktopGate({ children }: { children: ReactNode }) {
  const [go, setGo] = useState(() => !smallOrTouch());
  if (go) return children;
  return (
    <main className="notice">
      <h1>Best experienced on desktop</h1>
      <p>
        Seat selection is built for a mouse and a large screen. Touch support is
        coming.
      </p>
      <button onClick={() => setGo(true)}>Continue anyway</button>
    </main>
  );
}

export function ErrorCard({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <main className="notice" role="alert">
      <h1>{title}</h1>
      <p>Check your connection and try again.</p>
      <button onClick={() => location.reload()}>Try again</button>
      {detail && (
        <details>
          <summary>Details</summary>
          <pre>{detail}</pre>
        </details>
      )}
    </main>
  );
}

/** Catches render errors (including a failed WebGL context) instead of a blank page. */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: unknown }
> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <ErrorCard
        title="Something went wrong"
        detail={String(this.state.error)}
      />
    ) : (
      this.props.children
    );
  }
}
