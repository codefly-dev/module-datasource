import { address } from "@/server/composition";

// The browser's Connect calls, forwarded unchanged to the service they name.
//
// Both services' `connect` endpoints are internal, so the browser reaches them
// through this route rather than at an address of its own. It adds nothing: no
// credential, no identity, no header. What a browser sends is what the service
// judges — which is why a read the browser makes without a credential is
// refused by the datasource itself, not by this route.
//
// Only the calls this page makes are forwarded. FetchItem is not among them:
// a fetch carries the tenant's credential, so the page asks the host for it.
const CALLS: Record<string, { service: "registry" | "bucket"; methods: Set<string> }> = {
  "datasource.registry.v1.RegistryService": { service: "registry", methods: new Set(["Version", "GetCatalog", "Announce"]) },
  "datasource.bucket.v1.BucketService": { service: "bucket", methods: new Set(["Version", "Describe", "ListItems"]) },
};

// A unary Connect request this page sends is a few hundred bytes.
const MAX_BODY = 64 * 1024;

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const [name, method] = path;
  const call = CALLS[name ?? ""];
  if (path.length !== 2 || !call || !call.methods.has(method ?? "")) {
    return Response.json({ code: "unimplemented", message: `${path.join("/")} is not a call this page makes` }, { status: 404 });
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BODY) {
    return Response.json({ code: "resource_exhausted", message: "request too large" }, { status: 413 });
  }
  const answer = await fetch(`${address(call.service, "connect")}/${name}/${method}`, {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      "connect-protocol-version": request.headers.get("connect-protocol-version") ?? "1",
    },
    body,
    cache: "no-store",
  });
  return new Response(answer.body, {
    status: answer.status,
    headers: { "content-type": answer.headers.get("content-type") ?? "application/json" },
  });
}
