import { toJson } from "@bufbuild/protobuf";
import { ItemSchema, type Item, SourceSchema } from "@codefly-dev/datasource-bucket-client";
import { REDACTED, credential, datasource, failure, refusal, source } from "@/server/host";

// One item's bytes, streamed through the datasource with the tenant's
// credential handed over for this call. The page gets every byte back so it
// can compare them with what was written, rather than trusting a count.
export async function POST(request: Request) {
  const refused = refusal(request);
  if (refused) return refused;
  const { prefix = "", key = "", version = "" } = (await request.json()) as { prefix?: string; key?: string; version?: string };
  const named = source(prefix);
  const sent = { source: toJson(SourceSchema, named), credential: REDACTED, key, version };
  try {
    let item: Item | undefined;
    const chunks: Uint8Array[] = [];
    for await (const chunk of datasource().fetchItem({ source: named, credential: credential(), key, version })) {
      if (chunk.item) item = chunk.item;
      if (chunk.data.length > 0) chunks.push(chunk.data);
    }
    return Response.json({
      request: sent,
      item: item ? toJson(ItemSchema, item) : null,
      chunks: chunks.length,
      data: Buffer.concat(chunks).toString("base64"),
    });
  } catch (error) {
    return failure(error);
  }
}
