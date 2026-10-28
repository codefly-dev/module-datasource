import { Code, ConnectError } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { bucket } from "@codefly-dev/datasource-bucket-client";
import { registry } from "@codefly-dev/datasource-registry-client";

// What the browser calls itself, through the module's generated clients. It
// speaks Connect to this page's own origin, which forwards each call unchanged
// (src/app/api/connect): the browser holds no credential and none is added.
const transport = createConnectTransport({ baseUrl: "/api/connect" });

export const catalog = registry.New(transport).registry();
export const datasource = bucket.New(transport).bucket();

/** A call that did not succeed, in the words of the service that refused it. */
export type Refusal = { code: string; message: string };

export function refusalOf(error: unknown): Refusal {
  // The host answers its own refusals already in this shape.
  if (!(error instanceof Error) && typeof (error as Refusal)?.code === "string") return error as Refusal;
  const refused = ConnectError.from(error);
  return { code: Code[refused.code], message: refused.rawMessage };
}

/**
 * Ask the host to do what only the host can: write into the tenant store, or
 * read through the datasource carrying the tenant's credential for one call.
 */
export async function host<T>(path: "write" | "list" | "fetch", body: unknown): Promise<T> {
  const answer = await fetch(`/api/host/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-datasource-playground": "1" },
    body: JSON.stringify(body),
  });
  const parsed = await answer.json();
  if (!answer.ok) throw parsed.code ? (parsed as Refusal) : ({ code: String(answer.status), message: parsed.error } as Refusal);
  return parsed as T;
}
