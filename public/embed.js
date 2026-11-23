(() => {
  const script = document.currentScript;
  const EVENTS = ["ready", "seatSelected", "checkout"];
  const url = new URL("/", script.src);
  url.searchParams.set("venue", script.dataset.venue || "cape-point");
  if (script.dataset.event) url.searchParams.set("event", script.dataset.event);
  url.searchParams.set("embed", "1");

  // One registry for every embed on the page; reset() clears them all, or
  // just the one inside `target` (an element or selector).
  const embed = (window.StadiumEmbed ??= {
    frames: [],
    reset(target) {
      const host =
        typeof target === "string" ? document.querySelector(target) : target;
      for (const frame of this.frames)
        if (!host || host.contains(frame))
          frame.contentWindow?.postMessage({ type: "reset" }, url.origin);
    },
  });

  function mount() {
    const target = document.querySelector(script.dataset.target);
    if (!target) {
      console.warn(
        `Stadium embed: no element matches data-target="${script.dataset.target}"`,
      );
      return;
    }
    const frame = document.createElement("iframe");
    frame.allow = "fullscreen";
    frame.title = "Stadium seat selection";
    frame.style.cssText = "display:block;width:100%;border:0;aspect-ratio:16/9";
    const height = script.dataset.height;
    if (height)
      frame.style.height = /^\d+$/.test(height) ? height + "px" : height;
    window.addEventListener("message", (event) => {
      if (event.source !== frame.contentWindow || event.origin !== url.origin)
        return;
      const { type, payload } = event.data ?? {};
      // The app asks for the host's origin when the browser hides it.
      if (type === "hello")
        frame.contentWindow.postMessage({ type: "hello" }, url.origin);
      if (!EVENTS.includes(type)) return;
      // On the target, so pages with several embeds can tell them apart, and
      // on window for the common single-embed case.
      target.dispatchEvent(
        new CustomEvent("stadium:" + type, { detail: payload }),
      );
      window.dispatchEvent(
        new CustomEvent("stadium:" + type, { detail: payload }),
      );
    });
    frame.src = url.href;
    target.append(frame);
    embed.frames.push(frame);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
