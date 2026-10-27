# datasource

A Codefly module: a generic registry of datasources, plus one service per
datasource. A deployment composes the module and chooses which datasource
services come with it, so each deployment defines its own set of datasources.

| Service | What it is |
|---|---|
| `registry` | the generic control plane: the catalog, admitting and storing sources. Knows nothing about any particular datasource. |
| `bucket` | an object store, read through the composed [object-storage service](https://github.com/codefly-dev/service-object-storage). |

**A new datasource is added by adding code, never by modifying existing code** —
a new `services/<name>/` and nothing else. The registry resolves datasources from
what the deployment composed, not from a list in its own source.
See [AGENTS.md](./AGENTS.md).

Access control is not here: who may read a source, its boundary node and grants,
credential custody and the per-credential budget belong to the host.
