# DSH 0.1.2 client-module contract

Status: verified against the published `@deepseek-ai/dsh@0.1.2-rc.1` package
and its installed dependencies on 2026-09-04. This is a preview-version
contract, so re-run the repository check after every DSH upgrade.

## Package faces

| Face | Required package shape |
| --- | --- |
| Host only | ESM `main`/`exports["."]` with named `apply(ctx)`; no `dsh.client` and no `./client` export are required. |
| Client only | A minimal host `apply()` makes the package a Loader entry; `exports["./client"]` points to a browser classic script and `dsh.client.platform` is `"web"`. |
| Host + client | The host entry exports `apply(ctx)` (and an `inject` list where needed); the same package declares the client face exactly as above. |

For every web package, `package.json` must expose `./client` and declare:

```json
{
  "dsh": {
    "client": {
      "platform": "web",
      "inject": [],
      "external": []
    }
  }
}
```

`inject`, `external`, and optional `immediately` are validated by DSH. Omit
optional fields rather than supplying values of another type.

## Browser module model

The client entry is a classic script that only registers a lazy factory:

```js
window.__ModuleLoader__.load({
  id: 'package-name',
  factory: (require) => ({ inject: ['slots'], apply(ctx) { /* … */ } }),
});
```

DSH scans the active host Loader entries incrementally. Each package with
`dsh.client.platform: "web"` becomes a boot-graph row. Its `./client` source is
served in a revisioned combo bundle; the bundle must register the same package
name as its `id`.

Factories are materialized lazily. `require()` can resolve only, in this order:

1. a platform seed word supplied by the web shell (PTS uses `react`);
2. an already materialized client module;
3. a registered factory whose graph row has arrived.

Anything else produces the deliberately loud `missed the module table` error.
It is not a general browser module resolver.

Client services also follow the target package's public aggregate names. For
conversation accumulators, DSH 0.1.2 provides `uiConversation`; register through
`ctx.uiConversation.events.register(...)`. The pre-0.1.2 standalone
`conversationEvents` injection remains permanently pending and must not appear
in a client factory's `inject` array.

## Dependencies and bundling

`dsh.client.external` declares client-module package requests that must be
loaded before the consuming factory. The target package itself must be an active
web client package with a `dsh.client` declaration and `./client` export. DSH
orders these rows and fetches their factories before materializing the consumer.

Do not put arbitrary npm dependencies in `external`. Bundle browser-local code
into the classic entry, or make it a real DSH client package. Do not externalize
host-only packages, Node built-ins, or removed APIs. In particular,
`@deepseek-ai/dsh-client-runtime/client` was a 0.1.1 convenience import; it has
no 0.1.2 client package/boot row and therefore cannot be required or declared
as an external.

The official `@deepseek-ai/dsh-client-ui-conversation` package is the reference
dual-face package: it has `exports["."]`, `exports["./client"]`, and a web
`dsh.client` declaration whose `inject` array names real DSH client packages.

## PTS guardrail

Run `npm run check:dsh-client-contract`. The check inventories every package in
`dsh-plugins/`, validates web manifests and entries, parses classic-script
syntax, verifies factory identity, and rejects literal `require()` calls that
are neither the `react` platform seed nor explicitly declared client externals.
