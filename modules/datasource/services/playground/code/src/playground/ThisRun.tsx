import { Card, DescriptionList, List, ListItem, Stack } from "@codefly-dev/ui/layout";
import { ScenarioSteps } from "@codefly-dev/ui/playground";
import { useEffect } from "react";
import { CallStep, useCall } from "./call";
import { catalog, datasource } from "./clients";

// What this run is, and what it substitutes for a deployment.
export function ThisRun() {
  const registryVersion = useCall<string>();
  const bucketVersion = useCall<string>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arrival
  useEffect(() => {
    void registryVersion.run({}, async () => (await catalog.version({})).version, (version) => `registry ${version}`);
    void bucketVersion.run({}, async () => (await datasource.version({})).version, (version) => `bucket ${version}`);
  }, []);

  return (
    <Stack gap={6}>
      <Card title="Services in this composition" description="Started by codefly from this playground's declared dependencies.">
        <DescriptionList
          items={[
            { term: "registry", value: `the catalog — version ${registryVersion.result ?? "…"}` },
            { term: "bucket", value: `the first datasource — version ${bucketVersion.result ?? "…"}` },
            { term: "storage", value: "the object-storage gateway the bucket datasource reads through" },
            { term: "tenant", value: "a stand-in for a tenant's own store: MinIO behind its own gateway. Local only — never published." },
            { term: "playground", value: "this page and its server routes. Development only — not exported by the module." },
          ]}
        />
      </Card>
      <Card title="What stands in for a deployment here">
        <List variant="divided">
          <ListItem description="In a deployment the host keeps the credential a person entered and hands it over per call. Here the tenant store publishes its own MinIO keys to this playground's server, which plays the host. The browser never receives them.">
            The host's credential custody
          </ListItem>
          <ListItem description="The gateway admits a non-public store only as one of its own composed endpoints, as a container reaches them; this native server is handed localhost. A labelled stopgap rewrites a loopback origin to host.docker.internal. The real fix belongs to the object-storage agent.">
            Stopgap: the store's origin as the gateway reaches it
          </ListItem>
          <ListItem description="The JS SDK exposes no reader for a dependency's configuration, so the server reads the tenant's object-storage group the way sdk-go derives it. The fix belongs in codefly-dev/sdk-js.">
            Stopgap: reading the tenant's configuration
          </ListItem>
          <ListItem description="Who may read a source, grants over it and the per-credential budget belong to the host, not this module. This playground authorises nothing.">
            Not here: access control
          </ListItem>
        </List>
      </Card>
      <ScenarioSteps title="Calls made">
        <CallStep title="Registry version" operation="RegistryService.Version" call={registryVersion.call} />
        <CallStep title="Bucket version" operation="BucketService.Version" call={bucketVersion.call} />
      </ScenarioSteps>
    </Stack>
  );
}
