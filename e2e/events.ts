import { expect, type Locator } from "@playwright/test";

/** The payload of the latest `type` event printed by embed-test.html. */
export async function lastEvent(events: Locator, type: string) {
  let payload: Record<string, unknown> | undefined;
  await expect
    .poll(async () => {
      const lines = ((await events.textContent()) ?? "")
        .split("\n")
        .filter((line) => line.startsWith(type + " "));
      payload = lines.length
        ? JSON.parse(lines.at(-1)!.slice(type.length + 1))
        : undefined;
      return lines.length;
    })
    .toBeGreaterThan(0);
  return payload!;
}

/** Waits for one more `type` event than `seen` and returns its payload. */
export async function nextEvent(events: Locator, type: string, seen: number) {
  await expect
    .poll(
      async () =>
        ((await events.textContent()) ?? "")
          .split("\n")
          .filter((line) => line.startsWith(type + " ")).length,
    )
    .toBeGreaterThan(seen);
  return lastEvent(events, type);
}
