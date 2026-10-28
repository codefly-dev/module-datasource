import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, type Interceptor, createClient } from "@connectrpc/connect";
import { createConnectTransport, createGrpcTransport } from "@connectrpc/connect-node";
import { type Credential, CredentialSchema, type Source, SourceSchema, bucket } from "@codefly-dev/datasource-bucket-client";
import { ObjectStorage, PutRequestSchema } from "@/gen/storage/codefly/storage/v0/storage_pb";
import { TENANT_BUCKET, address, tenantStore } from "./composition";

// The playground plays the host's part here, on the server, because only the
// host holds a tenant's credential. In a deployment the host keeps the
// credential a person entered and hands one over for a single call; here the
// stand-in tenant store publishes its own. Everything after that hand-over is
// the path a deployment runs.

/** The bucket datasource, through its generated client. */
export function datasource() {
  return bucket.New(createConnectTransport({ baseUrl: address("bucket", "connect"), httpVersion: "1.1" })).bucket();
}

/** The source as any consumer names it: kind, endpoint, bucket, prefix. */
export function source(prefix: string): Source {
  return create(SourceSchema, { kind: "minio", endpoint: tenantStore().endpoint, bucket: TENANT_BUCKET, prefix });
}

/** The host's hand-over: the tenant's credential, for exactly one call. */
export function credential(): Credential {
  const { accessKey, secret } = tenantStore();
  return create(CredentialSchema, { kind: { case: "accessKey", value: { id: accessKey, secret } } });
}

/** What the page may see of a credential that was handed over: its form, never its material. */
export const REDACTED = { accessKey: { id: "(withheld)", secret: "(withheld)" } };

/**
 * Write one object into the tenant store through the store's own gateway.
 *
 * Writing is not a bound operation — the datasource only ever reads — so this
 * is the part a tenant does for itself, and it goes through the gateway that
 * fronts the tenant's store with that gateway's own token.
 */
export async function write(key: string, content: string) {
  const { gatewayToken } = tenantStore();
  const withToken: Interceptor = (next) => (request) => {
    request.header.set("x-codefly-token", gatewayToken);
    return next(request);
  };
  const tenant = createClient(
    ObjectStorage,
    createGrpcTransport({ baseUrl: address("tenant", "grpc"), interceptors: [withToken] }),
  );
  const bytes = new TextEncoder().encode(content);
  async function* body() {
    yield create(PutRequestSchema, {
      kind: { case: "header", value: { key, contentType: "text/plain; charset=utf-8", totalSize: BigInt(bytes.length) } },
    });
    yield create(PutRequestSchema, { kind: { case: "data", value: bytes } });
  }
  const result = await tenant.put(body());
  return { key, sizeBytes: bytes.length, version: result.etag };
}

/** A refused or failed call, as the page shows it: the code and the service's own words. */
export function failure(error: unknown) {
  const refused = ConnectError.from(error);
  return Response.json({ code: Code[refused.code], message: refused.rawMessage }, { status: 502 });
}

/**
 * Refuse a request this host would not itself make.
 *
 * These routes hold the tenant's credential, so a request that arrived by
 * accident or from another origin must not reach them: an explicit intent
 * header, and an Origin that names this host.
 */
export function refusal(request: Request): Response | undefined {
  if (request.headers.get("x-datasource-playground") !== "1") {
    return Response.json({ error: "explicit playground request required" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== request.headers.get("host")) {
    return Response.json({ error: "cross-origin request refused" }, { status: 403 });
  }
  return undefined;
}
