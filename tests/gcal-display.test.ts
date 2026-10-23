import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { googleToCal, hueOfHex } from "../lib/gcal/display";

const cal = { id: "personal@example.com", summary: "Personal", backgroundColor: "#16a765" };

describe("showing Google events in Orbit's calendar", () => {
  it("maps a timed event", () => {
    const [e] = googleToCal({ id: "e1", status: "confirmed", summary: "Dentist", location: "MG Road", start: { dateTime: "2026-10-22T16:00:00+05:30" }, end: { dateTime: "2026-10-22T17:00:00+05:30" }, htmlLink: "https://calendar.google.com/x" }, cal);
    assert.equal(e.id, "g:personal@example.com:e1");
    assert.equal(e.course, "Dentist");
    assert.equal(e.type, "google");
    assert.equal(e.source, "google");
    assert.equal(e.group, "Google · Personal");
    assert.equal(e.dayKey, "2026-10-22");
    assert.equal(e.range, "4:00 pm – 5:00 pm");
    assert.equal(e.room, "MG Road");
    assert.equal(e.endMs - e.startMs, 3_600_000);
    assert.equal(e.allDay, false);
    assert.equal(e.external, "https://calendar.google.com/x");
  });

  it("puts the day in India time even when Google reports another zone", () => {
    const [e] = googleToCal({ id: "e", start: { dateTime: "2026-10-22T20:00:00-04:00" }, end: { dateTime: "2026-10-22T21:00:00-04:00" } }, cal);
    assert.equal(e.dayKey, "2026-10-23"); // 20:00 in New York is 05:30 next day in India
  });

  it("spreads a multi-day all-day event across each day (Google's end date is exclusive)", () => {
    const out = googleToCal({ id: "trip", summary: "Goa trip", start: { date: "2026-11-06" }, end: { date: "2026-11-09" } }, cal);
    assert.deepEqual(out.map((e) => e.dayKey), ["2026-11-06", "2026-11-07", "2026-11-08"]);
    assert.ok(out.every((e) => e.allDay && e.range === "All day"));
    assert.equal(new Set(out.map((e) => e.id)).size, 3);
  });

  it("an all-day event with no end is a single day", () => {
    assert.equal(googleToCal({ id: "b", start: { date: "2026-11-06" } }, cal).length, 1);
  });

  it("skips cancelled and declined events, and ones without a start", () => {
    assert.equal(googleToCal({ id: "a", status: "cancelled", start: { dateTime: "2026-10-22T16:00:00+05:30" } }, cal).length, 0);
    assert.equal(googleToCal({ id: "b", start: { dateTime: "2026-10-22T16:00:00+05:30" }, end: { dateTime: "2026-10-22T17:00:00+05:30" }, attendees: [{ self: true, responseStatus: "declined" }] }, cal).length, 0);
    assert.equal(googleToCal({ id: "c" }, cal).length, 0);
  });

  it("names an untitled event and guards a bad end time", () => {
    const [e] = googleToCal({ id: "d", start: { dateTime: "2026-10-22T16:00:00+05:30" }, end: { dateTime: "2026-10-22T15:00:00+05:30" } }, cal);
    assert.equal(e.course, "(No title)");
    assert.ok(e.endMs > e.startMs);
  });

  it("keeps the calendar's own colour", () => {
    assert.equal(hueOfHex("#ff0000"), 0);
    assert.equal(hueOfHex("#00ff00"), 120);
    assert.equal(hueOfHex("#0000ff"), 240);
    assert.equal(hueOfHex("not a colour"), 210);
    assert.equal(hueOfHex(undefined, 99), 99);
    assert.equal(hueOfHex("#808080"), 210); // grey has no hue
  });
});
