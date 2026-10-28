import { toJson } from "@bufbuild/protobuf";
import { SourceSchema } from "@codefly-dev/datasource-bucket-client";
import { source } from "@/server/host";

// The source the host reads, named as any consumer names it. Nothing here is
// secret: a source says where, never what opens it.
export function GET(request: Request) {
  const prefix = new URL(request.url).searchParams.get("prefix") ?? "";
  return Response.json({ source: toJson(SourceSchema, source(prefix)) }, { headers: { "Cache-Control": "no-store" } });
}
