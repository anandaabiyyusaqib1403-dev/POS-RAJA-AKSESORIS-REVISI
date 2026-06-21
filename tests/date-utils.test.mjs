import assert from "node:assert/strict";
import test from "node:test";

import { endOfDay, startOfDay } from "../src/utils/format.js";

test("startOfDay and endOfDay clone Date inputs instead of mutating them", () => {
  const original = new Date("2026-05-24T12:34:56.789Z");
  const originalTime = original.getTime();

  const start = startOfDay(original);
  const end = endOfDay(original);

  assert.equal(original.getTime(), originalTime);
  assert.notEqual(start, original);
  assert.notEqual(end, original);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMinutes(), 59);
});

test("startOfDay and endOfDay can be used on the same Date without creating a moving limit", () => {
  const today = new Date("2026-05-24T12:00:00.000Z");
  const cursor = startOfDay(today);
  const limit = endOfDay(today);

  cursor.setDate(cursor.getDate() + 1);

  assert.ok(cursor > limit);
  assert.equal(today.getUTCDate(), 24);
});
