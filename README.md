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

No HTTP, no providers, no `fetch` — just the shapes. Build a third-party
OpenLLM client against this and nothing else.

## Install

```sh
bun install github:openllmsh/protocol # latest
```

```ts
import { ChatCompletionRequest } from "@openllmsh/protocol";
import { Schema } from "effect";

const req = Schema.decodeUnknownSync(ChatCompletionRequest)(body);
```

## License

[MIT](./LICENSE) © Quantide LLC.

---

> **Read-only mirror.** Regenerated from the OpenLLM monorepo each release.
> Issues & PRs welcome — they're ingested upstream and your commit is
> preserved. Sign-off (DCO) on commits, please.
