import { Badge, Button, Card, Field, Stack, Textarea } from "@codefly-dev/ui/layout";
import { useState } from "react";
import { CallLog, useCall } from "./call";
import { host } from "./clients";
import { EXAMPLES, type Written } from "./examples";

type WriteAnswer = { written: { key: string; sizeBytes: number; version: string }[] };

/**
 * The tenant puts its documents into its own store. This is the host's
 * privileged step, not a datasource call: the datasource only reads, and this
 * gives it something to read.
 */
export function WriteExamples({ written, onWritten }: { written: Written; onWritten: (written: Written) => void }) {
  const [agreement, setAgreement] = useState(EXAMPLES[0].content);
  const write = useCall<WriteAnswer>();
  const documents = [{ ...EXAMPLES[0], content: agreement }, ...EXAMPLES.slice(1)];

  async function run() {
    const answer = await write.run(
      { documents: documents.map(({ key, content }) => ({ key, bytes: new TextEncoder().encode(content).length })) },
      () => host<WriteAnswer>("write", { documents }),
      (value) => `The tenant store accepted ${value.written.length} document(s) and gave each a version.`,
    );
    if (!answer) return;
    const next = { ...written };
    for (const item of answer.written) {
      const content = documents.find((document) => document.key === item.key)?.content ?? "";
      next[item.key] = { content, version: item.version, sizeBytes: item.sizeBytes };
    }
    onWritten(next);
  }

  const count = Object.keys(written).length;
  return (
    <Card
      title="First, the tenant writes its documents"
      description="The host's step, done on the server: a contract, a finance export and a runbook go into the stand-in tenant store through that store's own gateway. The datasource takes no part — it only reads."
    >
      <Stack gap={3}>
        <Field label="The supply agreement's text" description="Change it if you like; the fetch journey compares what comes back with exactly these bytes.">
          {(control) => <Textarea {...control} rows={6} value={agreement} onChange={(event) => setAgreement(event.target.value)} />}
        </Field>
        <Stack direction="row" gap={2} align="center" className="flex-wrap">
          <Button onClick={() => void run()} disabled={write.running}>
            Write the {documents.length} documents
          </Button>
          {count > 0 && (
            <Badge tone="success" dot>
              {count} document(s) written during this visit
            </Badge>
          )}
        </Stack>
        <CallLog title="Write into the tenant store" operation="ObjectStorage.Put (tenant gateway, server-side)" calls={write.calls} />
      </Stack>
    </Card>
  );
}
