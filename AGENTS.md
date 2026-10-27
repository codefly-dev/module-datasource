# AGENTS.md

Orientation for anyone — human or agent — working in this repository. It links to
the authoritative docs rather than restating them; when this file and a linked doc
disagree, the linked doc wins.

## What this repo is

`datasource` is a Codefly **module**: a generic registry of datasources, plus one
service per datasource. A deployment composes the module and chooses which
datasource services come with it, so **each deployment defines its own set of
datasources**.

It is not a datasource. It is where datasources live.

- `modules/datasource/services/registry` — the generic control plane. It serves
  the catalog, admits and stores sources, and knows nothing about any particular
  datasource.
- `modules/datasource/services/bucket` — the first datasource. An object store
  read through the composed [object-storage service](https://github.com/codefly-dev/service-object-storage),
  which owns the backends (S3, GCS, Azure Blob, MinIO), the signing, the egress
  guard and the size caps.
- `modules/datasource/services/storage` — that gateway, composed.
- `modules/datasource/services/tenant` — a second object-storage service that
  stands in for a tenant's own bucket, so a bound read has a real store to name
  on a local run. It declares the agent's `minio` endpoint, which offers its
  local MinIO's S3 API to the services that depend on it. The agent refuses to
  **deploy** a service declaring it, so this one is a local proof by
  construction and is the first thing to leave the deployable composition.

`modules/datasource/contracts/object-storage` is the gateway's own contract,
pinned by commit (see its `PINNED`). It is input to `codefly generate proto`,
which writes the bindings the bucket service dials through; nothing in it is
edited here.

## The one rule this repo exists to hold

**A new datasource is added by adding code, never by modifying existing code.**

Concretely, adding a datasource means adding `services/<name>/` with its own
service declaration, its own API and its own tests. It does **not** mean:

- editing the registry — not its Go files, not a provider table, not a `switch`,
  not a list of names, not a blank-import block;
- adding a case to an enum of providers;
- widening a shared interface so the new one fits.

The registry resolves datasources from **what the deployment composed** — their
declared endpoints — not from anything written down in its own source. If you
find yourself editing the registry to make a new datasource work, the design has
been broken and the fix is in the registry's resolution, not in a new entry.

The test of this rule is mechanical: adding a datasource must leave
`services/registry/` untouched in the diff.

## A datasource's API is its own

There is no single interface every datasource implements, and there will not be
one. `ObjectStorage` streams (`Get`, `GetMany`, `Put`, `Watch`); the next
datasource will do something else. A closed set of shapes is what this module
exists to avoid.

What every datasource shares is a **vocabulary**, not a data plane: how it names
a source, how it describes an item's readers and provenance, and how it refuses.
That vocabulary is the module's published contract. How a datasource lists,
diffs, fetches, streams or watches is its own business, and its consumers call it
directly.

## What this module does not do

**Access control is not here.** Who may read a source, the boundary node it
writes into and the grants over it, custody of a tenant's credential, and the
budget metered per credential across replicas all belong to the host —
[`module-saas-starter`](https://github.com/codefly-dev/module-saas-starter)'s
accounts service today. This module authorises nothing on its own.

A datasource receives a credential **per call** and never persists it, never
returns it, and never logs it. The host hands it over for one call and the
service forgets it. Where a datasource is backed by a service that holds
backends, that service takes a per-call binding and stores nothing either.

In a deployment the credential comes from the host: a person enters it there,
it is encrypted at receipt and only its envelope reference is stored, and the
host decrypts one for one call. On a local run the tenant store's own
configuration stands in for that hand-over. Either way this module holds no
custody, and `bucket`'s tests assert the credential reaches the gateway and
nothing else.

## Working here

- Generated code comes from `codefly generate`, never a local pipeline.
- No address, port, DSN or credential is written down; the SDK resolves each one
  and a dependency is reached through its declaration.
- A playground is a composed service, never a hand-written dev server.
- Run it before you propose it: a technical change runs locally first, and the
  record follows it.
- Build the simplest thing that works. ~500 hand-written lines is a change's
  budget; past 2,000 stop and ask.

## Where this came from

The design, its measurements and the constraints that produced this shape are in
the handbook: `design/datasource-module.md` in
[`obin-ai/handbook`](https://github.com/obin-ai/handbook). The short version: the
datasource surface was the largest in accounts — 34 RPCs, more than
authorization — its provider set was closed by the host's build, and its data
plane could not be closed into one interface at all.
