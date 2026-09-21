<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="./assets/openllm-light.svg">
    <img alt="OpenLLM" src="./assets/openllm.svg" width="300">
  </picture>
</p>

<p align="center"><b>protocol</b> — the public protocol surface for OpenLLM.</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green.svg"></a>
  <img alt="deps: effect only" src="https://img.shields.io/badge/deps-effect%20only-blue.svg">
</p>

---

The pure, dependency-light **type & wire contracts** every OpenLLM client
speaks — defined once as [Effect Schema](https://effect.website) (runtime
validators **and** inferred TypeScript types from a single source):

- chat completions · responses · streaming events
- provider request/response shapes · cost & model catalog
- request-status · daemon & relay control frames

No HTTP, no provider implementations, no `fetch` — contracts and pure helpers.
Build a third-party OpenLLM client against this and nothing else.

## Install

```sh
bun install github:openllmsh/protocol # latest
```

```ts
import { ChatCompletionRequest } from "@openllmsh/protocol";
import { Schema } from "effect";

const req = Schema.decodeUnknownSync(ChatCompletionRequest)(body);
```

## Model identity matching

`model-match.ts` provides pure matching primitives shared by request resolution
and catalog metadata inheritance. `deriveModelIdentityRules` derives namespaces,
variant tokens, and attached-version evidence from existing catalog model IDs;
there are no provider-specific token lists or model-family regex tables to update.

- `buildModelCandidates` preserves raw upstream IDs while parsing comparable
  family/version structure.
- `selectRequestModel` filters eligibility before choosing the newest matching
  release, then applies caller-supplied provider preference and alphabetical ties.
  Exact IDs and named suffixes take precedence over shorthand.
- `selectMetadataDonor` chooses an exact identity or family/variant-compatible
  predecessor, preferring the target provider. Generation increments can inherit
  metadata too; media successors frequently increment a single integer rather
  than a minor version. Successor donors and empty-family matches are rejected.
  It returns a donor, not a merged model: field precedence and provenance belong
  to the consuming catalog layer.
- Numbered builds such as `-001` and `-002` remain snapshots rather than family
  names. At equal version/provider preference, stable aliases precede builds,
  then newer builds precede older ones; explicit pins are unchanged.

`plan-surface.ts` carries an explicit media request's surface to daemon plan
resolution. Missing surface retains chat semantics; general model-detail lookup
can resolve across surfaces without applying a chat-only filter.

The caller supplies catalog entries and availability; these utilities do not
fetch model lists, inspect credentials, or perform provider authentication.

## License

[MIT](./LICENSE) © OpenLLM, INC.

---

> **Read-only mirror.** Regenerated from the OpenLLM monorepo each release.
> Issues & PRs welcome — they're ingested upstream and your commit is
> preserved. Sign-off (DCO) on commits, please.
