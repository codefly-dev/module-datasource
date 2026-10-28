import { toJson } from "@bufbuild/protobuf";
import { ListItemsResponseSchema, SourceSchema } from "@codefly-dev/datasource-bucket-client";
import { REDACTED, credential, datasource, failure, refusal, source } from "@/server/host";

// One page of a source's items, read through the datasource with the tenant's
// credential handed over for this call and no other.
export async function POST(request: Request) {
  const refused = refusal(request);
  if (refused) return refused;
  const { prefix = "", limit = 0, pageToken = "" } = (await request.json()) as { prefix?: string; limit?: number; pageToken?: string };
  const named = source(prefix);
  const sent = { source: toJson(SourceSchema, named), credential: REDACTED, limit, pageToken };
  try {
    const page = await datasource().listItems({ source: named, credential: credential(), limit, pageToken });
    return Response.json({ request: sent, response: toJson(ListItemsResponseSchema, page) });
  } catch (error) {
    return failure(error);
  }
}
