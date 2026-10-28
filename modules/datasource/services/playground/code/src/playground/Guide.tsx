import { Button, Card, Stack } from "@codefly-dev/ui/layout";
import { TextBlock } from "@codefly-dev/ui/content";
import { CapabilityGuide, type PlaygroundCapability } from "@codefly-dev/ui/playground";
import { ArrowRight } from "lucide-react";

// Every public capability of the module, including the ones this run cannot
// show, with where each is shown.
function capabilities(open: (scenario: string) => void): PlaygroundCapability[] {
  const action = (scenario: string, label: string) => (
    <Button variant="secondary" onClick={() => open(scenario)}>
      {label} <ArrowRight size={16} aria-hidden="true" />
    </Button>
  );
  return [
    {
      id: "catalog",
      title: "A catalog of what announced itself",
      description: "RegistryService.GetCatalog: every datasource whose announcement still stands, with what it reaches and where.",
      status: "demonstrated",
      action: action("catalog", "Open the catalog"),
    },
    {
      id: "announce",
      title: "Announcement under a lease",
      description: "RegistryService.Announce: a datasource joins the catalog by announcing itself, renews, and lapses when it stops. The registry names none.",
      status: "demonstrated",
      action: action("catalog", "Announce one and watch it lapse"),
    },
    {
      id: "describe",
      title: "A datasource describes itself",
      description: "BucketService.Describe: the kinds it reaches, whether a read needs a credential, whether items stream.",
      status: "demonstrated",
      action: action("describe", "Ask the bucket datasource"),
    },
    {
      id: "list",
      title: "List a source, page by page",
      description: "BucketService.ListItems: key, length and an opaque version per item; a page with no continuation token is the complete listing.",
      status: "demonstrated",
      action: action("list", "List the tenant's documents"),
    },
    {
      id: "fetch",
      title: "Fetch an item byte-identically",
      description: "BucketService.FetchItem streams the bytes and names the version actually read; a named version is a precondition.",
      status: "demonstrated",
      action: action("fetch", "Fetch and compare"),
    },
    {
      id: "refused",
      title: "No credential, no read",
      description: "A read carrying no usable credential is refused, never answered with the deployment's own access.",
      status: "demonstrated",
      action: action("refused", "Try it from the browser"),
    },
    {
      id: "version",
      title: "Service versions",
      description: "RegistryService.Version and BucketService.Version.",
      status: "demonstrated",
      action: action("run", "Open this run"),
    },
    {
      id: "access-token",
      title: "A short-lived access token as the credential",
      description: "A Credential may carry an access token instead of an access key — the form a Google store takes.",
      status: "reachable",
      reason: "The stand-in tenant store is MinIO, which opens with an access key. No store here accepts a token, so this form is not exercised.",
    },
    {
      id: "kinds",
      title: "Reading S3, GCS and Azure stores",
      description: "The bucket datasource reaches s3, minio, gcs and azure stores through the object-storage gateway.",
      status: "unreachable",
      reason: "This local run composes only a MinIO tenant store. Reading another kind needs that store and its credential, which a local run does not have.",
    },
  ];
}

export function Guide({ onOpen }: { onOpen: (scenario: string) => void }) {
  return (
    <Stack gap={6}>
      <Card
        title="Datasources a deployment chooses, read with a credential it hands over per call"
        description="This module is a registry of datasources plus one service per datasource. The registry knows none of them by name: each datasource announces itself. The first one, bucket, reads an object store."
      >
        <Stack gap={3}>
          <TextBlock text="Everything here runs against the live composition. The tenant's documents live in a stand-in store; the server side of this page plays the host, which holds the tenant's credential and hands it to the datasource for one read at a time." />
          <Stack direction="row">
            <Button onClick={() => onOpen("catalog")}>
              Start with the catalog <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </Stack>
        </Stack>
      </Card>
      <CapabilityGuide capabilities={capabilities(onOpen)} />
    </Stack>
  );
}
