import type { DescribeResponse } from "@codefly-dev/datasource-bucket-client";
import type { Datasource } from "@codefly-dev/datasource-registry-client";
import { Badge, Button, Card, DescriptionList, Grid, Stack } from "@codefly-dev/ui/layout";
import { ScenarioSteps } from "@codefly-dev/ui/playground";
import { useEffect } from "react";
import { CallLog, useCall, useOnArrival } from "./call";
import { catalog, datasource } from "./clients";

const FIELDS = ["name", "title", "kinds", "requiresCredential", "streams"] as const;

function shown(value: DescribeResponse | Datasource, field: (typeof FIELDS)[number]) {
  const raw = value[field];
  return Array.isArray(raw) ? raw.join(", ") : String(raw);
}

export function Describe() {
  const described = useCall<DescribeResponse>();
  const announced = useCall<Datasource | undefined>();

  async function ask() {
    const answer = await described.run(
      {},
      () => datasource.describe({}),
      (value) =>
        `${value.title}: reaches ${value.kinds.join(", ")}; ${value.requiresCredential ? "every read needs a credential for that call" : "reads need no credential"}; items ${value.streams ? "stream" : "arrive whole"}.`,
      ({ $typeName: _, ...value }) => value,
    );
    if (!answer) return;
    await announced.run(
      {},
      async () => (await catalog.getCatalog({})).datasources.find((entry) => entry.name === answer.name),
      (entry) => (entry ? `The catalog holds "${entry.name}", announced from ${entry.address}.` : `The catalog holds no "${answer.name}" right now.`),
      (entry) => (entry ? (({ $typeName: _, ...rest }) => rest)(entry) : null),
    );
  }

  useOnArrival(() => {
    void ask();
  });

  const answer = described.result;
  const entry = announced.result;
  const agrees = answer && entry && FIELDS.every((field) => shown(answer, field) === shown(entry, field));
  return (
    <Stack gap={6}>
      <Grid cols={2}>
        <Card
          title="What the datasource says about itself"
          description="BucketService.Describe, asked of the bucket datasource directly."
          actions={
            <Button variant="secondary" onClick={() => void ask()} disabled={described.running}>
              Ask again
            </Button>
          }
        >
          {answer && (
            <DescriptionList
              items={[
                { term: "Name", value: answer.name },
                { term: "Title", value: answer.title },
                { term: "Kinds it reaches", value: answer.kinds.join(", ") },
                { term: "A read needs a credential", value: answer.requiresCredential ? "yes — handed over per call" : "no" },
                { term: "Items stream", value: answer.streams ? "yes — bytes arrive in chunks" : "no" },
              ]}
            />
          )}
        </Card>
        <Card title="What the catalog holds for it" description="The same datasource's entry in RegistryService.GetCatalog.">
          {entry ? (
            <DescriptionList
              items={[
                ...FIELDS.map((field) => ({ term: field as string, value: shown(entry, field) })),
                // The address is the catalog's own: a datasource announces it,
                // and its Describe answer does not carry it.
                { term: "address", value: entry.address },
              ]}
            />
          ) : (
            announced.call?.state === "done" && "Not in the catalog right now — it has not announced, or its announcement lapsed."
          )}
        </Card>
      </Grid>
      {answer && entry && (
        <Badge tone={agrees ? "success" : "danger"} dot>
          {agrees
            ? "Identical: the catalog entry is the datasource's own Describe answer, plus the address it announced"
            : "The catalog entry differs from what the datasource describes"}
        </Badge>
      )}
      <ScenarioSteps title="Calls made">
        <CallLog title="Ask the datasource to describe itself" operation="BucketService.Describe" calls={described.calls} />
        <CallLog title="Find its catalog entry" operation="RegistryService.GetCatalog" calls={announced.calls} />
      </ScenarioSteps>
    </Stack>
  );
}
