import type { ListItemsRequest, ListItemsResponse } from "@codefly-dev/datasource-bucket-client";
import { Badge, Banner, Button, Card, DescriptionList, Field, SegmentedControl, Stack } from "@codefly-dev/ui/layout";
import { ScenarioSteps } from "@codefly-dev/ui/playground";
import { useEffect, useState } from "react";
import { CallStep, useCall } from "./call";
import { datasource } from "./clients";
import { TENANT_FOLDER } from "./examples";

type Source = { kind: string; endpoint: string; bucket: string; prefix: string };

// What the browser sends. It holds no credential of the tenant's, so each of
// these is either nothing or something that is not the tenant's.
const ATTEMPTS = {
  none: { label: "No credential", credential: undefined, expect: "the datasource refuses before anything reaches the store" },
  incomplete: {
    label: "An access key with no secret",
    credential: { kind: { case: "accessKey", value: { id: "acme-ops", secret: "" } } },
    expect: "the datasource refuses a credential it cannot use",
  },
  wrong: {
    label: "Someone else's access key",
    credential: { kind: { case: "accessKey", value: { id: "not-the-tenant", secret: "not-the-tenants-secret" } } },
    expect: "the store itself refuses it: the read used the credential it was given, not the deployment's own access",
  },
} as const;
type Attempt = keyof typeof ATTEMPTS;

export function Refusal({ onOpen }: { onOpen: (scenario: string) => void }) {
  const [source, setSource] = useState<Source>();
  const [attempt, setAttempt] = useState<Attempt>("none");
  const read = useCall<ListItemsResponse>();

  useEffect(() => {
    void fetch(`/api/host/source?prefix=${encodeURIComponent(TENANT_FOLDER)}`)
      .then((answer) => answer.json())
      .then((answer: { source: Source }) => setSource(answer.source));
  }, []);

  async function attemptRead() {
    if (!source) return;
    const { credential } = ATTEMPTS[attempt];
    const request = { source, ...(credential ? { credential } : {}) } as unknown as Partial<ListItemsRequest>;
    await read.run(
      { source, credential: credential ?? "(none)" },
      () => datasource.listItems(request),
      (page) => `Admitted, and ${page.items.length} item(s) were read. A read without the tenant's credential must not succeed.`,
      ({ $typeName: _, ...page }) => page,
    );
  }

  const outcome = read.call?.state === "failed" ? read.call.refusal : undefined;
  return (
    <Stack gap={6}>
      <Banner title="Fail closed">
        A read names its source and carries a credential for that one call. A read that carries none is refused; it never
        falls back to the deployment's own access to the store.
      </Banner>
      <Card
        title="Read the tenant's source from this browser"
        description="This call goes from the browser to BucketService.ListItems through the module's generated client. The page forwards it unchanged and adds nothing, so whatever happens is the datasource's own decision."
      >
        <Stack gap={4}>
          {source && (
            <DescriptionList
              layout="inline"
              items={[
                { term: "Source", value: `${source.kind} · bucket ${source.bucket} · prefix ${source.prefix}` },
                { term: "Endpoint", value: source.endpoint },
              ]}
            />
          )}
          <Field label="What the read carries" description={ATTEMPTS[attempt].expect}>
            {(control) => (
              <SegmentedControl
                id={control.id}
                options={Object.entries(ATTEMPTS).map(([value, each]) => ({ value: value as Attempt, label: each.label }))}
                value={attempt}
                onValueChange={setAttempt}
              />
            )}
          </Field>
          <Stack direction="row" gap={2} className="flex-wrap">
            <Button onClick={() => void attemptRead()} disabled={!source || read.running}>
              Try the read
            </Button>
            <Button variant="outline" onClick={() => onOpen("list")}>
              Compare: the same source with the tenant's credential
            </Button>
          </Stack>
          {outcome && (
            <Badge tone="success" dot>
              Refused with {outcome.code}: {outcome.message}
            </Badge>
          )}
          {read.call?.state === "done" && (
            <Badge tone="danger" dot>
              The read was admitted — the fail-closed rule did not hold
            </Badge>
          )}
        </Stack>
      </Card>
      <ScenarioSteps title="Calls made">
        <CallStep title={`Read carrying: ${ATTEMPTS[attempt].label.toLowerCase()}`} operation="BucketService.ListItems (from the browser)" call={read.call} />
      </ScenarioSteps>
    </Stack>
  );
}
