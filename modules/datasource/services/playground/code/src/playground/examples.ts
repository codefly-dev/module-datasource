// A small, coherent set of documents a tenant keeps in its own store: a
// contract, a finance export and a runbook, under the tenant's folder. They are
// synthetic, and the tenant (not the datasource) writes them.
export const TENANT_FOLDER = "acme-ops/";

export const EXAMPLES: { key: string; content: string }[] = [
  {
    key: `${TENANT_FOLDER}contracts/northwind-supply-agreement.txt`,
    content: [
      "SUPPLY AGREEMENT — Acme Operations Ltd and Northwind Components GmbH",
      "Effective 1 September 2026, for a term of 24 months.",
      "",
      "1. Northwind supplies M8 stainless fasteners at EUR 0.042 per unit, minimum order 50,000 units.",
      "2. Delivery within 10 business days of a purchase order, DAP Rotterdam.",
      "3. Either party may terminate on 90 days' written notice.",
    ].join("\n"),
  },
  {
    key: `${TENANT_FOLDER}finance/q3-2026-revenue.csv`,
    content: [
      "month,region,orders,revenue_eur",
      "2026-07,EMEA,412,186420.00",
      "2026-07,NA,288,141310.50",
      "2026-08,EMEA,397,179905.25",
      "2026-08,NA,301,150044.00",
      "2026-09,EMEA,445,201377.75",
      "2026-09,NA,315,158912.40",
    ].join("\n"),
  },
  {
    key: `${TENANT_FOLDER}runbooks/connect-a-datasource.md`,
    content: [
      "# Connect a datasource",
      "",
      "1. Name the source: its kind, endpoint, bucket and prefix.",
      "2. Store the credential with the host. The datasource never keeps it.",
      "3. The host hands the credential over for each read, and only that read.",
    ].join("\n"),
  },
];

/** What the tenant wrote during this visit: the bytes, and the version the store gave them. */
export type Written = Record<string, { content: string; version: string; sizeBytes: number }>;
