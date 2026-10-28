import { getCurrentModule, networkInstance } from "codefly";

// What this playground reaches, resolved from the composition: codefly injects
// each declared dependency and the SDK reads it. No host, port or credential is
// written down here.

/** A dependency's address, as an origin a transport can dial. */
export function address(service: "registry" | "bucket" | "tenant", api: "connect" | "grpc"): string {
  const { address } = networkInstance({ module: getCurrentModule(), service, api });
  return /^https?:\/\//.test(address) ? address : `http://${address}`;
}

// The configuration group the object-storage agent publishes to the services
// that depend on it.
const OBJECT_STORAGE = "object-storage";

/**
 * The tenant store as the host would name it, and what opens it.
 *
 * A deployment takes these from the host, which holds the credential a person
 * entered. A local run takes them from the composition: the `tenant` service
 * declares the agent's `minio` endpoint, so its MinIO's origin and keys are
 * published to this playground, a stand-in for a tenant's own bucket.
 */
export function tenantStore() {
  const value = (key: string, secret = false) => {
    const found = dependencyConfiguration("tenant", OBJECT_STORAGE, key, secret);
    if (!found) throw new Error(`the composition published no ${OBJECT_STORAGE}/${key} for the tenant store`);
    return found;
  };
  return {
    endpoint: asTheGatewayReachesIt(value("minio_endpoint")),
    accessKey: value("minio_access_key"),
    secret: value("minio_secret_key", true),
    gatewayToken: value("token", true),
  };
}

/**
 * The bucket the tenant store keeps its objects in. The object-storage agent
 * publishes no bucket name to its dependents, so this is the agent's
 * documented default for a store configured with none — a source's own
 * configuration in a deployment.
 */
export const TENANT_BUCKET = "documents";

/**
 * STOPGAP (codefly JS SDK): read a dependency's configuration value.
 *
 * sdk-go answers this as `codefly.For(ctx).Service(name).Configuration(group,
 * key)` (and `.Secret`); the JS SDK publishes only the workspace-level
 * equivalents, so a Node service cannot ask for a dependency's configuration
 * at all. This mirrors sdk-go's derivation of the carrier
 * (core/resources.ServiceConfigurationKeyFromUnique) for that one question.
 * The fix belongs in codefly-dev/sdk-js, which should export the service-level
 * readers; this function goes when it does.
 */
function dependencyConfiguration(service: string, group: string, key: string, secret: boolean): string | undefined {
  const spell = (part: string) => part.toUpperCase().replaceAll("-", "_");
  const prefix = secret ? "CODEFLY__SERVICE_SECRET_CONFIGURATION" : "CODEFLY__SERVICE_CONFIGURATION";
  return process.env[`${prefix}__${spell(getCurrentModule())}__${spell(service)}__${spell(group)}__${spell(key)}`]?.trim() || undefined;
}

/**
 * asTheGatewayReachesIt rewrites the tenant store's origin from this process's
 * view to the view the datasource's gateway has of it.
 *
 * THIS IS A STOPGAP, not a fix. A bound read may name a non-public destination
 * only when it is one of the gateway's own composed endpoints, and the gateway
 * builds that set from its dependencies as a CONTAINER reaches them. This
 * playground is a native process, so the agent resolved `minio_endpoint` for
 * the native view — `localhost:<port>` — which the gateway has never heard of
 * and refuses with PERMISSION_DENIED.
 *
 * The real fix belongs to the object-storage agent, which is the only party
 * that knows both views: it should publish the store's origin as its own
 * gateway reaches it, rather than leaving every caller to guess. Until it
 * does, a native caller on a local run translates, and only for a loopback
 * origin — anything else is passed through untouched, so a deployment, where
 * the host supplies a real public endpoint, never goes near this.
 */
function asTheGatewayReachesIt(origin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return origin;
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) return origin;
  parsed.hostname = CONTAINER_HOST_FROM_OUTSIDE;
  return parsed.origin;
}

// How a container reaches a port published on the host. The object-storage
// agent's own composed-endpoint handling names it.
const CONTAINER_HOST_FROM_OUTSIDE = "host.docker.internal";
