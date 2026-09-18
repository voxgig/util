# Implementation rationale

Logger construction returns an explicitly supplied logger unchanged. Otherwise the configured level takes precedence, with the debug flag and default level supplying fallbacks.

Ordering and rendering rules are shared across the TypeScript and Go ports. Preserve deterministic object ordering and the documented host-representation differences rather than relying on incidental map iteration.

Sources: [Go logging](go/log.go), [agent guide](AGENTS.md).
