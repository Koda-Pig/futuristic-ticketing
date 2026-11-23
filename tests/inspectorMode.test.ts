import { expect, it } from "vitest";
import { isInspectorMode } from "../src/inspectorMode";

it.each([
  ["", false],
  ["?debug", false],
  ["?debug=shell", true],
  ["?debug=materials", true],
] as const)("routes %s to the intended entry point", (query, expected) => {
  expect(isInspectorMode(query)).toBe(expected);
});
