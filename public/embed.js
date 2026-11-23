(() => {
  const script = document.currentScript;
  const target = document.querySelector(script.dataset.target);
  if (!target) return;
  const url = new URL("/", script.src);
  url.searchParams.set("venue", script.dataset.venue || "cape-point");
  if (script.dataset.event) url.searchParams.set("event", script.dataset.event);
  url.searchParams.set("embed", "1");
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
    if (["ready", "seatSelected", "checkout"].includes(event.data?.type))
      window.dispatchEvent(
        new CustomEvent("stadium:" + event.data.type, {
          detail: event.data.payload,
        }),
      );
  });
  window.StadiumEmbed = {
    reset: () => frame.contentWindow.postMessage({ type: "reset" }, url.origin),
  };
  frame.src = url.href;
  target.append(frame);
})();
