import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../config";
import type { Meeting, Slot } from "../types";

const CAL_FILE = path.join(DATA_DIR, "mock-calendar.json");

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MON = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

interface BusyBlock {
  weekday: string;
  start: string;
  end: string;
  title: string;
}

interface CalendarModel {
  timezone: string;
  businessHours: { start: string; end: string };
  slotMinutes: number;
  busy: BusyBlock[];
  meetings: Meeting[];
  _note?: string;
}

// Loaded once into memory; mutations persist the whole model back to disk.
const model: CalendarModel = JSON.parse(fs.readFileSync(CAL_FILE, "utf8"));

function persist(): void {
  fs.writeFileSync(CAL_FILE, JSON.stringify(model, null, 2));
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Build a local-time Date for a given calendar day at `minutes` past midnight. */
function dateAt(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function label(d: Date): string {
  return `${WD[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface FindSlotsOptions {
  /** Start scanning from this instant (default: now). */
  fromISO?: string;
  /** Number of business days to scan (default: 5). */
  days?: number;
  /** Slot length (default: calendar's slotMinutes, 30). */
  durationMins?: number;
  /** Only return slots on these weekdays, e.g. ["Wed","Thu"] (empty = any). */
  preferWeekdays?: string[];
  /** Cap on slots returned (default: 6). */
  maxSlots?: number;
}

/**
 * Return free business-hours slots in the requested window. Busy blocks are
 * weekday templates mapped onto real upcoming dates; booked meetings are
 * absolute. Naive by design (no timezone math, no double-booking guard beyond
 * the mock) — see the README "Where it breaks".
 */
export function findOpenSlots(options: FindSlotsOptions = {}): Slot[] {
  const businessDays = options.days ?? 5;
  const duration = options.durationMins ?? model.slotMinutes;
  const maxSlots = options.maxSlots ?? 6;
  const prefer = (options.preferWeekdays ?? []).map((w) => w.slice(0, 3).toLowerCase());
  const now = options.fromISO ? new Date(options.fromISO) : new Date();

  const openStart = toMinutes(model.businessHours.start);
  const openEnd = toMinutes(model.businessHours.end);

  const collect = (applyPrefer: boolean): Slot[] => {
    const out: Slot[] = [];
    const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let businessDaysSeen = 0;

    while (businessDaysSeen < businessDays && out.length < maxSlots) {
      const dow = cursor.getDay();
      const isWeekday = dow >= 1 && dow <= 5;
      if (isWeekday) {
        businessDaysSeen++;
        const wdShort = WD[dow];
        const passesPrefer = !applyPrefer || prefer.length === 0 || prefer.includes(wdShort.toLowerCase());

        if (passesPrefer) {
          const dayBusy = model.busy.filter((b) => b.weekday === wdShort);
          for (let t = openStart; t + duration <= openEnd && out.length < maxSlots; t += duration) {
            const start = dateAt(cursor, t);
            const end = dateAt(cursor, t + duration);
            if (start.getTime() <= now.getTime()) continue; // future only

            const clashesBusy = dayBusy.some((b) =>
              overlaps(t, t + duration, toMinutes(b.start), toMinutes(b.end)),
            );
            if (clashesBusy) continue;

            const clashesMeeting = model.meetings.some((m) =>
              overlaps(start.getTime(), end.getTime(), new Date(m.startISO).getTime(), new Date(m.endISO).getTime()),
            );
            if (clashesMeeting) continue;

            out.push({ label: label(start), startISO: start.toISOString(), endISO: end.toISOString(), weekday: wdShort });
          }
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  };

  // Honor preferred weekdays first; if that yields nothing, fall back to any day.
  const preferred = collect(true);
  return preferred.length > 0 ? preferred : collect(false);
}

/**
 * Resolve a loose slot string to a concrete future datetime. Accepts an ISO
 * timestamp, or a "Wed 15:30" / "Thu Jun 4, 10:00" style label — finds the next
 * matching weekday+time within the next two weeks.
 */
export function resolveSlot(input: string, durationMins = model.slotMinutes): { startISO: string; endISO: string; label: string } | null {
  const iso = new Date(input);
  if (input.includes("T") && !Number.isNaN(iso.getTime())) {
    const end = new Date(iso.getTime() + durationMins * 60_000);
    return { startISO: iso.toISOString(), endISO: end.toISOString(), label: label(iso) };
  }

  const wdMatch = input.match(/\b(mon|tue|wed|thu|fri|sat|sun)/i);
  const timeMatch = input.match(/(\d{1,2}):(\d{2})/);
  if (!wdMatch || !timeMatch) return null;

  const targetDow = WD.findIndex((w) => w.toLowerCase() === wdMatch[1].toLowerCase());
  const targetMin = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
  const now = new Date();

  for (let i = 0; i < 14; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (day.getDay() !== targetDow) continue;
    const start = dateAt(day, targetMin);
    if (start.getTime() <= now.getTime()) continue;
    const end = new Date(start.getTime() + durationMins * 60_000);
    return { startISO: start.toISOString(), endISO: end.toISOString(), label: label(start) };
  }
  return null;
}

let meetingSeq = model.meetings.length;
function nextMeetingId(): string {
  meetingSeq += 1;
  return `mtg-${String(meetingSeq).padStart(3, "0")}`;
}

/** Append a booked meeting linked to a deal and persist it to mock-calendar.json. */
export function bookMeeting(args: { dealId: string; startISO: string; endISO: string; title: string }): Meeting {
  const meeting: Meeting = {
    id: nextMeetingId(),
    dealId: args.dealId,
    title: args.title,
    startISO: args.startISO,
    endISO: args.endISO,
    hasBrief: false,
  };
  model.meetings.push(meeting);
  persist();
  return meeting;
}

/**
 * Flexible booking for /simulate-send: take a slot label/ISO if given (and
 * resolvable), otherwise fall back to the first open slot. Always books
 * something sensible so the demo never dead-ends.
 */
export function bookForSimulateSend(dealId: string, slot: string | undefined, title: string): { meeting: Meeting; resolvedFrom: string } {
  if (slot) {
    const resolved = resolveSlot(slot);
    if (resolved) {
      return { meeting: bookMeeting({ dealId, startISO: resolved.startISO, endISO: resolved.endISO, title }), resolvedFrom: `"${slot}" → ${resolved.label}` };
    }
  }
  const open = findOpenSlots({ maxSlots: 1 });
  if (open.length === 0) throw new Error("No open slots available to book");
  return { meeting: bookMeeting({ dealId, startISO: open[0].startISO, endISO: open[0].endISO, title }), resolvedFrom: slot ? `"${slot}" unresolved → first open slot ${open[0].label}` : `first open slot ${open[0].label}` };
}

export function getMeetings(): Meeting[] {
  return model.meetings;
}

export function getMeetingsForDeal(dealId: string): Meeting[] {
  return model.meetings.filter((m) => m.dealId === dealId);
}

export function getMeetingById(id: string): Meeting | undefined {
  return model.meetings.find((m) => m.id === id);
}

/** Meetings starting within the next `hours` (the morning-of window). */
export function getMeetingsDueWithin(hours: number): Meeting[] {
  const now = Date.now();
  const horizon = now + hours * 3_600_000;
  return model.meetings.filter((m) => {
    const start = new Date(m.startISO).getTime();
    return start >= now && start <= horizon;
  });
}

/** Public formatter for a stored meeting's start time, e.g. "Wed Jun 3, 15:30". */
export function labelForISO(iso: string): string {
  return label(new Date(iso));
}

/** Mark a meeting as briefed so Trigger B never double-fires for it. */
export function markBriefed(meetingId: string): void {
  const meeting = model.meetings.find((m) => m.id === meetingId);
  if (meeting) {
    meeting.hasBrief = true;
    persist();
  }
}
