import type { Datasource } from "@codefly-dev/datasource-registry-client";
import { Badge, Banner, Button, Card, Stack, Table, TableBody, TableCell, TableEmptyState, TableHead, TableHeader, TableRow } from "@codefly-dev/ui/layout";
import { ScenarioSteps } from "@codefly-dev/ui/playground";
import { useEffect, useState } from "react";
import { CallLog, useCall, useOnArrival } from "./call";
import { catalog } from "./clients";

// The registry's own lease and renewal interval (services/registry, catalog.go).
const LEASE_SECONDS = 90;

// A datasource this page announces itself, to show the registry admitting a
// name it has never heard of. Nothing answers at its address, and this page
// never renews it, so it lapses on its own.
const EXAMPLE = {
  name: "example-announced-here",
  title: "Announced from this playground",
  kinds: ["example"],
  requiresCredential: false,
  streams: false,
  address: "nothing-answers.invalid:0",
};

export function Catalog() {
  const read = useCall<Datasource[]>();
  const announce = useCall<bigint>();
  const incomplete = useCall<bigint>();
  const [announcedAt, setAnnouncedAt] = useState<number>();
  const [lapsedAfter, setLapsedAfter] = useState<number>();
  const [now, setNow] = useState(Date.now());

  async function readCatalog() {
    const datasources = await read.run(
      {},
      async () => (await catalog.getCatalog({})).datasources,
      (found) => `${found.length} datasource(s) announced and not lapsed: ${found.map((entry) => entry.name).join(", ") || "none"}.`,
      (found) => ({ datasources: found.map(({ $typeName: _, ...entry }) => entry) }),
    );
    if (datasources && announcedAt && !lapsedAfter && !datasources.some((entry) => entry.name === EXAMPLE.name)) {
      setLapsedAfter(Math.round((Date.now() - announcedAt) / 1000));
    }
  }

  async function announceExample() {
    const renew = await announce.run(
      { datasource: EXAMPLE },
      async () => (await catalog.announce({ datasource: EXAMPLE })).renewWithinSeconds,
      (seconds) => `Admitted. The registry asks for a renewal within ${seconds}s; this page will not renew it.`,
      (seconds) => ({ renewWithinSeconds: Number(seconds) }),
    );
    if (renew === undefined) return;
    setAnnouncedAt(Date.now());
    setLapsedAfter(undefined);
    await readCatalog();
  }

  // The first read, on arrival. Reading is all a catalog consumer does.
  useOnArrival(() => {
    void readCatalog();
  });

  // While the example stands, read again every few seconds so its lapse is seen
  // as it happens rather than asserted.
  const watching = announcedAt !== undefined && lapsedAfter === undefined;
  useEffect(() => {
    if (!watching) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      void readCatalog();
    }, 5000);
    return () => clearInterval(timer);
  });

  const entries = read.result ?? [];
  const remaining = announcedAt ? Math.max(0, LEASE_SECONDS - Math.round((now - announcedAt) / 1000)) : 0;
  return (
    <Stack gap={6}>
      <Banner title="Nothing here is configured">
        The registry's source names no datasource. Each row below is there because that datasource announced its own
        description and address, and keeps renewing. One that stops renewing leaves the catalog {LEASE_SECONDS}s after
        its last announcement.
      </Banner>
      <Card
        title="The catalog, as GetCatalog answers it"
        description="Read live from the registry through the module's generated client."
        actions={
          <Button variant="secondary" onClick={() => void readCatalog()} disabled={read.running}>
            Read the catalog again
          </Button>
        }
      >
        <Table aria-label="Announced datasources">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Kinds</TableHead>
              <TableHead>Credential</TableHead>
              <TableHead>Streams</TableHead>
              <TableHead>Address it announced</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableEmptyState colSpan={6}>{read.running ? "Reading…" : "No datasource is announced right now."}</TableEmptyState>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.name}>
                  <TableCell>{entry.name}</TableCell>
                  <TableCell>{entry.title}</TableCell>
                  <TableCell>{entry.kinds.join(", ")}</TableCell>
                  <TableCell>{entry.requiresCredential ? "required per call" : "none"}</TableCell>
                  <TableCell>{entry.streams ? "yes" : "no"}</TableCell>
                  <TableCell>{entry.address}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      <Card
        title="Announce one the registry has never heard of"
        description={`Announce "${EXAMPLE.name}" as a datasource would, then watch the catalog. It appears without any change to the registry, and because this page never renews it, it lapses after ${LEASE_SECONDS}s.`}
      >
        <Stack gap={3}>
          <Stack direction="row" gap={2} className="flex-wrap">
            <Button onClick={() => void announceExample()} disabled={announce.running}>
              Announce {EXAMPLE.name}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void incomplete.run(
                  { datasource: { name: "no-address" } },
                  async () => (await catalog.announce({ datasource: { name: "no-address" } })).renewWithinSeconds,
                  () => "Admitted without an address — the registry should have refused this.",
                )
              }
              disabled={incomplete.running}
            >
              Announce one with no address
            </Button>
          </Stack>
          {watching && (
            <Badge tone="info" dot>
              Standing — lapses in about {remaining}s unless renewed; re-reading every 5s
            </Badge>
          )}
          {lapsedAfter !== undefined && (
            <Badge tone="success" dot>
              Lapsed: gone from the catalog {lapsedAfter}s after it was announced
            </Badge>
          )}
        </Stack>
      </Card>
      <ScenarioSteps title="Calls made">
        <CallLog title="Read the catalog" operation="RegistryService.GetCatalog" calls={read.calls} />
        <CallLog title="Announce a datasource" operation="RegistryService.Announce" calls={announce.calls} />
        <CallLog title="Announce without an address" operation="RegistryService.Announce" calls={incomplete.calls} />
      </ScenarioSteps>
    </Stack>
  );
}
