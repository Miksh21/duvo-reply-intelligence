/**
 * Create the custom HubSpot deal properties this system writes to.
 * Idempotent: existing properties are skipped. Works on the HubSpot free tier
 * with a Private App token granting crm.objects.deals.write + crm.schemas.deals.write.
 *
 *   npm run setup:hubspot
 */
import { config } from "../src/config";

const GROUP = "dealinformation"; // default deal property group

type Def = {
  name: string;
  label: string;
  type: "string" | "enumeration";
  fieldType: "text" | "textarea" | "select";
  options?: Array<{ label: string; value: string }>;
};

const text = (name: string, label: string): Def => ({ name, label, type: "string", fieldType: "text" });
const long = (name: string, label: string): Def => ({ name, label, type: "string", fieldType: "textarea" });

const DEFS: Def[] = [
  long("meddpicc_pain", "MEDDPICC — Pain"),
  long("meddpicc_competitor", "MEDDPICC — Competitor"),
  long("meddpicc_champion", "MEDDPICC — Champion"),
  text("meddpicc_timeline", "MEDDPICC — Timeline"),
  long("meddpicc_decision_process", "MEDDPICC — Decision process"),
  long("meddpicc_metrics", "MEDDPICC — Metrics"),
  long("meddpicc_economic_buyer", "MEDDPICC — Economic buyer"),
  long("meddpicc_decision_criteria", "MEDDPICC — Decision criteria"),
  long("meddpicc_competition", "MEDDPICC — Competition"),
  long("pre_meeting_brief", "Pre-meeting brief"),
  {
    name: "evidence_quality",
    label: "Brief evidence quality",
    type: "enumeration",
    fieldType: "select",
    options: [
      { label: "strong", value: "strong" },
      { label: "thin", value: "thin" },
    ],
  },
  text("prospect_name", "Prospect name"),
  text("prospect_title", "Prospect title"),
  text("prospect_email", "Prospect email"),
  text("prospect_company", "Prospect company"),
];

async function main() {
  const token = config.hubspotAccessToken;
  if (!token) {
    console.error("Missing HUBSPOT_ACCESS_TOKEN in .env. Create a Private App (Settings → Integrations → Private Apps) with crm.objects.deals.write + crm.schemas.deals.write, and paste the pat-... token.");
    process.exit(1);
  }
  const base = config.hubspotBaseUrl;
  const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" };

  let created = 0;
  let existed = 0;
  for (const def of DEFS) {
    const check = await fetch(`${base}/crm/v3/properties/deals/${def.name}`, { headers });
    if (check.ok) {
      console.log(`· exists  ${def.name}`);
      existed++;
      continue;
    }
    const res = await fetch(`${base}/crm/v3/properties/deals`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: def.name,
        label: def.label,
        type: def.type,
        fieldType: def.fieldType,
        groupName: GROUP,
        ...(def.options ? { options: def.options } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Failed to create ${def.name}: ${res.status} ${body}`);
    }
    console.log(`✓ created ${def.name}`);
    created++;
  }
  console.log(`\nDone — ${created} created, ${existed} already existed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
