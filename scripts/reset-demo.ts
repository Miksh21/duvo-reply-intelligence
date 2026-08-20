/**
 * Reset demo state so the Loom is re-recordable:
 *  - empty the booked `meetings` in data/mock-calendar.json
 *  - delete out/hubspot-deals.json snapshot and out/slack-cards/*.json
 * The HubSpot seed (data/mock-hubspot-deals.json) is already pristine (nulls)
 * and is reloaded fresh on every server start, so it needs no reset.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const calFile = path.join(ROOT, "data", "mock-calendar.json");
const outDir = path.join(ROOT, "out");

const cal = JSON.parse(fs.readFileSync(calFile, "utf8")) as { meetings: unknown[] };
const cleared = cal.meetings.length;
cal.meetings = [];
fs.writeFileSync(calFile, JSON.stringify(cal, null, 2));
console.log(`✓ cleared ${cleared} booked meeting(s) from data/mock-calendar.json`);

const snapshot = path.join(outDir, "hubspot-deals.json");
if (fs.existsSync(snapshot)) {
  fs.unlinkSync(snapshot);
  console.log("✓ removed out/hubspot-deals.json");
}

const cardsDir = path.join(outDir, "slack-cards");
if (fs.existsSync(cardsDir)) {
  let n = 0;
  for (const f of fs.readdirSync(cardsDir)) {
    if (f.endsWith(".json")) {
      fs.unlinkSync(path.join(cardsDir, f));
      n++;
    }
  }
  console.log(`✓ removed ${n} slack card(s) from out/slack-cards/`);
}

console.log("Demo state reset. Restart the server (npm run dev) for a clean run.");
