# Vendored Codefly protos

These `codefly/**` protos are copied from **codefly-dev/core** so this service's
API can mark an operation with the method option
(`codefly.runnable.v0.operation`) a runtime derives an installed Runnable — and
so a tool — from. Nothing here is authored by this module.

They are byte for byte the files under `proto/` in core at commit
`e501458995d0`, the core version `code/go.mod` links. That is the point of the
pin: the linked core registers these descriptor paths from its
`generated/go/codefly/...` packages, so the marks the contract carries are the
marks the running service enforces. Moving the core pin moves these.
