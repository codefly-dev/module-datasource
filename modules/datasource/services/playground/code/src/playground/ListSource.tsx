import { Badge, Button, Card, Field, SegmentedControl, Stack, Table, TableBody, TableCell, TableEmptyState, TableHead, TableHeader, TableRow } from "@codefly-dev/ui/layout";
import { ScenarioSteps } from "@codefly-dev/ui/playground";
import { useState } from "react";
import { CallStep, useCall } from "./call";
import { host } from "./clients";
import { TENANT_FOLDER, type Written } from "./examples";
import { WriteExamples } from "./WriteExamples";

export type ListedItem = { key: string; sizeBytes?: string; version?: string; modifiedAt?: string; contentType?: string };
type Page = { request: unknown; response: { items?: ListedItem[]; nextPageToken?: string } };

const PREFIXES = [
  { value: TENANT_FOLDER, label: TENANT_FOLDER },
  { value: `${TENANT_FOLDER}finance/`, label: `${TENANT_FOLDER}finance/` },
];
const PAGE_SIZES = [
  { value: "2", label: "2 per page" },
  { value: "100", label: "100 per page" },
];

export function ListSource({ written, onWritten, onListed }: { written: Written; onWritten: (written: Written) => void; onListed?: (items: ListedItem[]) => void }) {
  const [prefix, setPrefix] = useState(TENANT_FOLDER);
  const [limit, setLimit] = useState("2");
  const [pages, setPages] = useState<Page["response"][]>([]);
  const list = useCall<Page>();

  async function read(pageToken: string) {
    const page = await list.run(
      { prefix, limit: Number(limit), pageToken, credential: "handed over by the host for this call" },
      () => host<Page>("list", { prefix, limit: Number(limit), pageToken }),
      ({ response }) =>
        `${response.items?.length ?? 0} item(s) on this page; ${response.nextPageToken ? "a continuation token says there is more" : "no continuation token, so the listing is complete"}.`,
      (value) => value,
    );
    if (!page) return;
    const next = pageToken ? [...pages, page.response] : [page.response];
    setPages(next);
    onListed?.(next.flatMap((each) => each.items ?? []));
  }

  const items = pages.flatMap((page) => page.items ?? []);
  const last = pages.at(-1);
  return (
    <Stack gap={6}>
      <WriteExamples written={written} onWritten={onWritten} />
      <Card
        title="Then list the source through the datasource"
        description="BucketService.ListItems names the source (kind, endpoint, bucket, prefix) and carries the tenant's credential for this one call. The host hands it over on the server; the page never sees it."
      >
        <Stack gap={4}>
          <Stack direction="row" gap={4} className="flex-wrap">
            <Field label="Prefix">
              {(control) => <SegmentedControl id={control.id} options={PREFIXES} value={prefix} onValueChange={setPrefix} />}
            </Field>
            <Field label="Page size">
              {(control) => <SegmentedControl id={control.id} options={PAGE_SIZES} value={limit} onValueChange={setLimit} />}
            </Field>
          </Stack>
          <Stack direction="row" gap={2} className="flex-wrap">
            <Button onClick={() => void read("")} disabled={list.running}>
              List the first page
            </Button>
            {last?.nextPageToken && (
              <Button variant="secondary" onClick={() => void read(last.nextPageToken ?? "")} disabled={list.running}>
                Follow the continuation token
              </Button>
            )}
          </Stack>
          <Table aria-label="Listed items">
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Length</TableHead>
                <TableHead>Version (opaque)</TableHead>
                <TableHead>Modified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableEmptyState colSpan={5}>{pages.length ? "The listing is complete and holds no item under this prefix." : "Nothing listed yet."}</TableEmptyState>
              ) : (
                pages.flatMap((page, index) =>
                  (page.items ?? []).map((item) => (
                    <TableRow key={`${index}-${item.key}`}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{item.key}</TableCell>
                      <TableCell>{item.sizeBytes ?? "0"} bytes</TableCell>
                      <TableCell>{item.version || "none — the store gave no strong version"}</TableCell>
                      <TableCell>{item.modifiedAt ? new Date(item.modifiedAt).toLocaleString() : "—"}</TableCell>
                    </TableRow>
                  )),
                )
              )}
            </TableBody>
          </Table>
          {last && (
            <Badge tone={last.nextPageToken ? "info" : "success"} dot>
              {last.nextPageToken
                ? `Page ${pages.length} is not the last: the datasource returned a continuation token`
                : `Complete after ${pages.length} page(s): no continuation token was returned`}
            </Badge>
          )}
        </Stack>
      </Card>
      <ScenarioSteps title="Calls made">
        <CallStep title="List one page" operation="BucketService.ListItems (credential handed over by the host)" call={list.call} />
      </ScenarioSteps>
    </Stack>
  );
}
