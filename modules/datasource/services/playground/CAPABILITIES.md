# Capability map

Every public capability of the datasource module, where a person exercises it,
and what has actually been verified. Status is per row and honest: `verified`
means it was driven against the live composition and its result inspected;
`weak` means it is demonstrated but thinly; `unverified` means nobody has
checked. Nothing here is marked from a passing build.

Verified at `12dcc7c`, against the local composition (registry, bucket,
storage, tenant), driven from a browser by `code/tests/journeys.spec.ts`.

| Capability | Where | Evidence | Status |
|---|---|---|---|
| A catalog of what announced itself — `RegistryService.GetCatalog` | The catalog | `GetCatalog` Done; one row, `bucket`, with the address it announced (`localhost:1183`). The pane states "The registry's source names no datasource." | verified |
| A datasource joins by announcing — `RegistryService.Announce` | The catalog → *Announce example-announced-here* | Button present; the announcement and its 90s lapse are demonstrated in-pane | weak — the lapse takes 90s, so the suite does not wait for it |
| An announcement is refused without an address | The catalog → *Announce one with no address* | Button present, refusal path exists | unverified — not driven by the suite |
| A datasource describes itself — `BucketService.Describe` | Describe | Renders; compared field by field against the catalog entry | weak — pane verified rendering, its call not asserted |
| List a source, page by page — `BucketService.ListItems` | List a source | Write then list driven; items carry key, length and an opaque version | verified |
| Continuation tokens — a complete page says so | List a source → *Follow the continuation token* | Button present | unverified — the example set fits one page |
| Fetch an item, byte for byte — `BucketService.FetchItem` | Fetch an item | 350 bytes in 1 chunk; SHA-256 `d02ffeae…050fc2` identical to the write; read at version `ba6d4a6e…de7d` | verified |
| A version is a precondition, not a selector | Fetch an item → *Fetch only at version …* | Pane explains it; pinned fetch is refused after a rewrite | unverified — not driven by the suite |
| A read with no credential is refused | No credential, no read → *No credential* | Driven; refused | verified |
| An access key with no secret is refused | No credential, no read | Driven; refused | verified |
| Someone else's access key is refused **by the store** | No credential, no read | `PermissionDenied: The Access Key Id you provided does not exist in our records` — past argument validation | verified |
| The credential never reaches the browser | Fetch an item, This run | Privileged calls go through `/api/host/*`, server-rendered; the request shows `"credential": "handed over by the host for this call"` rather than a value | verified by inspection, not by a test asserting absence |
| `datasource_catalog` and `bucket_describe` as agent tools | — | Derived by `codefly generate runnables`; `operation.json` carries each tool's name, description and `EFFECT_READ_ONLY` | unverified in the playground — no pane exercises a tool call |
| Service versions — `RegistryService.Version`, `BucketService.Version` | This run | Both answer; the suite asserts `Unimplemented` appears nowhere on the pane | verified |

## What the independent review changed

A first-time-user review at `7fe0c73` found four things worth recording, three
of them defects rather than polish:

- **A capability badged `Demonstrated` did not work.** Supplying our own gRPC
  server replaces the generated Version-only one, and the business types embed
  `UnimplementedXServer`, so both `Version` endpoints answered 501 while the
  card stayed green. Fixed in both services, with a regression test each.
- **`Calls made` discarded what the comparison panes compare.** It kept the
  latest call per kind while numbering entries like a log, so the three
  refusals could never be seen together and page 2 replaced page 1. It now
  appends, and a spec drives all three refusals to prove it.
- **An instruction did not hold as written.** "after rewriting the documents
  above, the same pinned fetch is refused" — it is not, because identical bytes
  keep the identical version. The sentence now says to change the text first.
- **`Compare: the same source with the tenant's credential` does not
  compare** — it navigates to an empty pane, discarding the refusal just
  produced. Not yet fixed.

Two findings belong to the shared kit, not here, and are not patched in
`node_modules`: `No response yet.` is shown under a **failed** call, where
there will never be a response (`@codefly-dev/ui/dist/playground`), and the
`next dev` indicator overlaps the write button at 390px wide.

## What this run substitutes for a deployment

- **The host.** The server side of this page holds the tenant store's
  credential and hands it over per call. In a deployment that is the host,
  from its own custody. The datasource's side of the contract is identical.
- **The tenant's store.** A second object-storage service stands in for a
  customer's bucket. The agent refuses to deploy a service declaring its
  `minio` endpoint, so this arrangement is local by construction.
- **A loopback stopgap.** A bound read may name a non-public destination only
  as one of the gateway's composed endpoints, computed as a *container*
  reaches them, so a native caller's `localhost:<port>` is rewritten to
  `host.docker.internal:<port>`. Labelled in `src/server`, and the real fix
  belongs to the object-storage agent.

## Not demonstrated, and why

- **Reads as agent tools.** Every read needs a credential, and a tool's input
  schema is model-facing — a `credential` field would ask a model for a secret.
  A read tool must name a source id the host resolves, which needs a host
  operation that does not exist yet.
- **A second datasource.** The module's rule is that adding one leaves
  `services/registry/` untouched. With one datasource composed, the playground
  shows the catalog is announced rather than configured, but it cannot show the
  rule holding across two.
