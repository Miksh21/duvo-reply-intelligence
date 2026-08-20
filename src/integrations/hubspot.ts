import fs from "node:fs";
import path from "node:path";
import { config, DATA_DIR, OUT_DIR, ROOT } from "../config";
import type { Deal, DealProperties } from "../types";

/**
 * The seam a real HubSpot impl drops into. The in-memory mock and the live
 * CRM v3 client below both satisfy it; the exported `hubspot` picks the real one
 * automatically when HUBSPOT_ACCESS_TOKEN is set, else the mock.
 */
export interface HubSpotClient {
  getDeal(dealId: string): Promise<Deal>;
  updateDeal(dealId: string, properties: Partial<DealProperties>): Promise<Deal>;
  listDeals(): Promise<Deal[]>;
}

/** Standard + custom deal properties we read back (custom ones made by setup:hubspot). */
const DEAL_READ_PROPS = [
  "dealname", "amount", "dealstage", "pipeline",
  "meddpicc_pain", "meddpicc_competitor", "meddpicc_champion", "meddpicc_timeline",
  "meddpicc_decision_process", "meddpicc_metrics", "meddpicc_economic_buyer",
  "meddpicc_decision_criteria", "meddpicc_competition", "pre_meeting_brief",
  "evidence_quality", "prospect_name", "prospect_title", "prospect_email", "prospect_company",
] as const;

// ---------------------------------------------------------------------------
// Mock — in-memory store seeded from data/mock-hubspot-deals.json
// ---------------------------------------------------------------------------
const SEED_FILE = path.join(DATA_DIR, "mock-hubspot-deals.json");
const SNAPSHOT_FILE = path.join(OUT_DIR, "hubspot-deals.json");

export class InMemoryHubSpotClient implements HubSpotClient {
  private deals = new Map<string, Deal>();

  constructor() {
    const raw = JSON.parse(fs.readFileSync(SEED_FILE, "utf8")) as Record<string, unknown>;
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith("_")) continue;
      this.deals.set(key, structuredClone(value) as Deal);
    }
  }

  async getDeal(dealId: string): Promise<Deal> {
    const deal = this.deals.get(dealId);
    if (!deal) throw new Error(`HubSpot mock: deal "${dealId}" not found`);
    return deal;
  }

  async updateDeal(dealId: string, properties: Partial<DealProperties>): Promise<Deal> {
    const deal = await this.getDeal(dealId);
    const bag = deal.properties as unknown as Record<string, unknown>;
    const changed: string[] = [];
    for (const [key, value] of Object.entries(properties)) {
      if (value === undefined) continue;
      bag[key] = value;
      changed.push(key);
    }
    console.log(`📝 HubSpot(mock).updateDeal("${dealId}") — wrote ${changed.length} field(s):`);
    for (const key of changed) {
      const v = bag[key];
      const shown = typeof v === "string" && v.length > 90 ? `${v.slice(0, 90)}…` : JSON.stringify(v);
      console.log(`     · ${key} = ${shown}`);
    }
    if (changed.length === 0) console.log("     · (no non-undefined fields supplied)");
    this.snapshot();
    return deal;
  }

  async listDeals(): Promise<Deal[]> {
    return [...this.deals.values()];
  }

  private snapshot(): void {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const obj: Record<string, Deal> = {};
    for (const [key, deal] of this.deals) obj[key] = deal;
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(obj, null, 2));
    console.log(`     ↳ snapshot: ${path.relative(ROOT, SNAPSHOT_FILE)}`);
  }
}

// ---------------------------------------------------------------------------
// Real — HubSpot CRM v3 via a Private App token (works on the free tier)
// ---------------------------------------------------------------------------
export class HubSpotApiClient implements HubSpotClient {
  constructor(
    private token: string,
    private base: string = config.hubspotBaseUrl,
  ) {}

  private async api(method: string, route: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.base}${route}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HubSpot ${method} ${route} → ${res.status} ${res.statusText} ${text}`.trim());
    }
    return res.status === 204 ? null : res.json();
  }

  async getDeal(dealId: string): Promise<Deal> {
    const data = await this.api("GET", `/crm/v3/objects/deals/${dealId}?properties=${DEAL_READ_PROPS.join(",")}`);
    return mapHubSpotDeal(dealId, data.properties ?? {});
  }

  async updateDeal(dealId: string, properties: Partial<DealProperties>): Promise<Deal> {
    const props: Record<string, string> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (value === undefined) continue; // undefined = skip; null clears
      props[key] = value ?? "";
    }
    const data = await this.api("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties: props });
    console.log(`📝 HubSpot(real).updateDeal("${dealId}") — wrote ${Object.keys(props).length} field(s): ${Object.keys(props).join(", ")}`);
    return mapHubSpotDeal(dealId, data.properties ?? {});
  }

  async listDeals(): Promise<Deal[]> {
    const data = await this.api("GET", `/crm/v3/objects/deals?limit=100&properties=${DEAL_READ_PROPS.join(",")}`);
    return (data.results ?? []).map((d: any) => mapHubSpotDeal(d.id, d.properties ?? {}));
  }
}

/** Map a flat HubSpot property bag into our Deal shape. */
function mapHubSpotDeal(id: string, p: Record<string, string | null>): Deal {
  const val = (k: string) => (p[k] && p[k] !== "" ? p[k] : null);
  return {
    id,
    dealname: p.dealname ?? "",
    amount: p.amount ? Number(p.amount) : null,
    dealstage: p.dealstage ?? "",
    pipeline: p.pipeline ?? "",
    company: p.prospect_company ?? "",
    industry: "",
    contact: { name: p.prospect_name ?? "", title: p.prospect_title ?? "", email: p.prospect_email ?? "" },
    source: "HubSpot (CRM v3)",
    properties: {
      meddpicc_pain: val("meddpicc_pain"),
      meddpicc_competitor: val("meddpicc_competitor"),
      meddpicc_champion: val("meddpicc_champion"),
      meddpicc_timeline: val("meddpicc_timeline"),
      meddpicc_decision_process: val("meddpicc_decision_process"),
      meddpicc_metrics: val("meddpicc_metrics"),
      meddpicc_economic_buyer: val("meddpicc_economic_buyer"),
      meddpicc_decision_criteria: val("meddpicc_decision_criteria"),
      meddpicc_competition: val("meddpicc_competition"),
      pre_meeting_brief: val("pre_meeting_brief"),
      evidence_quality: val("evidence_quality"),
      prospect_name: val("prospect_name"),
      prospect_title: val("prospect_title"),
      prospect_email: val("prospect_email"),
      prospect_company: val("prospect_company"),
    },
  };
}

// Pick the real client when a token is present, else the mock. One env var to go live.
export const hubspot: HubSpotClient = config.hubspotAccessToken
  ? new HubSpotApiClient(config.hubspotAccessToken)
  : new InMemoryHubSpotClient();

console.log(
  config.hubspotAccessToken
    ? "🔌 HubSpot: LIVE (CRM v3 private-app token)"
    : "🧪 HubSpot: mock (in-memory) — set HUBSPOT_ACCESS_TOKEN to go live",
);
