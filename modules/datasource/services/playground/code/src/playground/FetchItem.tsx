import { Badge, Button, Card, DescriptionList, Field, Grid, SegmentedControl, Stack } from "@codefly-dev/ui/layout";
import { CodeBlock } from "@codefly-dev/ui/content";
import { ScenarioSteps } from "@codefly-dev/ui/playground";
import { useEffect, useState } from "react";
import { CallLog, useCall } from "./call";
import { host } from "./clients";
import { EXAMPLES, type Written } from "./examples";
import { WriteExamples } from "./WriteExamples";

type Fetched = {
  request: unknown;
  item: { key: string; sizeBytes?: string; version?: string; contentType?: string } | null;
  chunks: number;
  data: string;
};

function bytesOf(base64: string) {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function sha256(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function FetchItem({ written, onWritten }: { written: Written; onWritten: (written: Written) => void }) {
  const [key, setKey] = useState(EXAMPLES[0].key);
  const fetched = useCall<Fetched>();
  const pinned = useCall<Fetched>();
  const [digests, setDigests] = useState<{ read: string; wrote?: string }>();

  async function fetchItem(call: typeof fetched, version: string) {
    return call.run(
      { key, version, credential: "handed over by the host for this call" },
      () => host<Fetched>("fetch", { key, version }),
      (value) =>
        `${bytesOf(value.data).length} bytes in ${value.chunks} chunk(s), read at version ${value.item?.version || "(none)"}.`,
      ({ data: _, ...value }) => value,
    );
  }

  const read = fetched.result;
  const readBytes = read ? bytesOf(read.data) : undefined;
  const wrote = written[key];
  const wroteBytes = wrote ? new TextEncoder().encode(wrote.content) : undefined;
  useEffect(() => {
    if (!readBytes) return;
    void Promise.all([sha256(readBytes), wroteBytes ? sha256(wroteBytes) : undefined]).then(([readDigest, wroteDigest]) =>
      setDigests({ read: readDigest, wrote: wroteDigest }),
    );
  }, [read, wrote]); // eslint-disable-line react-hooks/exhaustive-deps

  const identical = readBytes && wroteBytes ? sameBytes(readBytes, wroteBytes) : undefined;
  const versionRead = read?.item?.version ?? "";
  return (
    <Stack gap={6}>
      <WriteExamples written={written} onWritten={onWritten} />
      <Card
        title="Fetch one item through the datasource"
        description="BucketService.FetchItem streams the item's bytes. Its first chunk names the item it is answering for, so the reader learns the version it actually read."
      >
        <Stack gap={4}>
          <Field label="Item">
            {(control) => (
              <SegmentedControl
                id={control.id}
                options={EXAMPLES.map((example) => ({ value: example.key, label: example.key.split("/").at(-1) ?? example.key }))}
                value={key}
                onValueChange={(next) => {
                  setKey(next);
                  setDigests(undefined);
                }}
              />
            )}
          </Field>
          <Stack direction="row" gap={2}>
            <Button onClick={() => void fetchItem(fetched, "")} disabled={fetched.running}>
              Fetch {key.split("/").at(-1)}
            </Button>
          </Stack>
          {read && readBytes && (
            <Grid cols={2}>
              <Card title="What came back" titleAs="h4">
                <DescriptionList
                  items={[
                    { term: "Key", value: read.item?.key ?? "—" },
                    { term: "Length", value: `${readBytes.length} bytes in ${read.chunks} chunk(s)` },
                    { term: "Version read", value: versionRead || "none — the store gave no strong version" },
                    { term: "SHA-256", value: digests?.read ?? "…" },
                  ]}
                />
              </Card>
              <Card title="What was written" titleAs="h4">
                {wrote ? (
                  <DescriptionList
                    items={[
                      { term: "Key", value: key },
                      { term: "Length", value: `${wroteBytes?.length} bytes` },
                      { term: "Version the store gave the write", value: wrote.version },
                      { term: "SHA-256", value: digests?.wrote ?? "…" },
                    ]}
                  />
                ) : (
                  "Not written during this visit, so there is nothing here to compare with. Write the documents above, then fetch again."
                )}
              </Card>
            </Grid>
          )}
          {identical !== undefined && (
            <Badge tone={identical ? "success" : "danger"} dot>
              {identical
                ? `Byte-identical: all ${readBytes?.length} bytes match what was written${wrote?.version === versionRead ? ", at the version the write produced" : ""}`
                : "The bytes differ from what was written"}
            </Badge>
          )}
          {readBytes && <CodeBlock code={new TextDecoder().decode(readBytes)} />}
        </Stack>
      </Card>
      {versionRead && (
        <Card
          title="Read only while the version still holds"
          description={`A version named in the request is a precondition, not a selector: the read happens only while the item still carries it. Fetch pinned to ${versionRead}; change the supply agreement's text above, write again, and the same pinned fetch is refused — identical bytes keep the identical version, so it is a changed item that breaks the pin, not a repeated write.`}
        >
          <Stack direction="row" gap={2}>
            <Button variant="secondary" onClick={() => void fetchItem(pinned, versionRead)} disabled={pinned.running}>
              Fetch only at version {versionRead}
            </Button>
          </Stack>
        </Card>
      )}
      <ScenarioSteps title="Calls made">
        <CallLog title="Fetch the item" operation="BucketService.FetchItem (credential handed over by the host)" calls={fetched.calls} />
        <CallLog title="Fetch pinned to a version" operation="BucketService.FetchItem with version" calls={pinned.calls} />
      </ScenarioSteps>
    </Stack>
  );
}
