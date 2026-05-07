# @parallel/sdk

Wallets for the agent economy. The official TypeScript SDK for [Parallel](https://github.com/parallel-platform).

A wallet is the primitive — a real on-chain address with a balance and a transaction history. **Entities** are an optional labeling layer underneath a wallet (`agent`, `service`, or anything else) that let you attribute each transaction to whatever you want.

## Install

```bash
npm install @parallel/sdk
```

Requires Node.js 20 or later. No peer dependencies, no transitive deps.

## Quickstart

```ts
import { Parallel } from "@parallel/sdk";

const parallel = new Parallel({
  apiKey: process.env.PARALLEL_API_KEY!,
  // baseUrl defaults to http://localhost:3000 in dev
});

// 1. Create a wallet
const wallet = await parallel.wallets.create({ name: "main treasury" });

// 2. Optionally create entities under it for attribution
const researchBot = await parallel.entities.create({
  walletId: wallet.id,
  name: "research-bot",
  type: "agent",
});

const translationApi = await parallel.entities.create({
  walletId: wallet.id,
  name: "translation-api",
  type: "service",
});

// 3. Fund the wallet (testnet faucet in demo)
await parallel.wallets.fund(wallet.id);

// 4. Send — optionally tagged with an entity
await parallel.wallets.transfer(wallet.id, {
  to: "0xRecipient…",
  amount: "0.50",
  entityId: researchBot.id, // omit for an untagged transaction
});

// 5. Read state
const detail = await parallel.wallets.get(wallet.id);
console.log(detail.balance, detail.entities, detail.transactions);

const stats = await parallel.entities.get(researchBot.id);
console.log(stats.totalSpent, stats.totalReceived, stats.net);

const all = await parallel.wallets.list();
```

## API

### `new Parallel(options)`

| Option    | Type     | Required | Default                  |
| --------- | -------- | -------- | ------------------------ |
| `apiKey`  | `string` | yes      | —                        |
| `baseUrl` | `string` | no       | `http://localhost:3000`  |
| `fetch`   | `fetch`  | no       | `globalThis.fetch`       |

### Wallets

| Method | Description |
| --- | --- |
| `wallets.create({ name })` | Creates a new on-chain wallet and returns `{ id, name, walletAddress, createdAt }`. |
| `wallets.list()` | Returns all wallets with current USDC balances and entity counts. |
| `wallets.get(id)` | Returns a wallet with `balance`, its `entities`, and recent `transactions` (each may have an `entity` ref). |
| `wallets.fund(id)` | Pulls testnet USDC from the CDP faucet. Returns `{ txHash }`. |
| `wallets.transfer(id, { to, amount, entityId? })` | Sends USDC from the wallet. If `entityId` is supplied, the resulting `TRANSFER_OUT` row is attributed to that entity. Returns `{ txHash }`. |

### Entities

| Method | Description |
| --- | --- |
| `entities.create({ walletId, name, type })` | Adds an entity to a wallet. `type` is a free-form string — `"agent"`, `"service"`, `"other"` are conventional. |
| `entities.get(id)` | Returns the entity plus aggregate stats: `totalSpent`, `totalReceived`, `net`, `transactionCount`, and the entity's transaction list. |
| `entities.delete(id)` | Deletes the entity. Existing transactions stay; their `entity` becomes `null` (untagged). |

## Agent tools

`@parallel/sdk` ships a small framework-agnostic tool layer so the agents *inside* your app can act on their own wallet. Bind to a wallet (and optionally an entity) and pass the result to whatever LLM framework you're using.

```ts
import {
  Parallel,
  agentTools,
  toOpenAITools,
  toAnthropicTools,
  executeToolCall,
} from "@parallel/sdk";

const parallel = new Parallel({ apiKey: process.env.PARALLEL_API_KEY! });

// Build the tool set for one agent.
const tools = agentTools(parallel, {
  walletId: agent.walletId,
  entityId: agent.entityId, // optional — auto-attributes outgoing transfers
});
```

Four tools come back:

| Tool | What it does |
| --- | --- |
| `get_wallet_balance` | Returns the wallet's current USDC balance + address. |
| `get_wallet_info` | Returns wallet name, address, balance, attached entities, and which entity (if any) this agent is bound to. |
| `get_recent_transactions` | Returns the wallet's most recent transactions (incoming, outgoing, and faucet). Optional `limit` argument (1-50). |
| `send_usdc` | Sends USDC to a `to` address. Returns `{ txHash, explorerUrl, status }`. Auto-attributed to the bound entity if one was provided. |

### OpenAI

```ts
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages,
  tools: toOpenAITools(tools),
});

for (const call of response.choices[0].message.tool_calls ?? []) {
  const result = await executeToolCall(
    tools,
    call.function.name,
    JSON.parse(call.function.arguments),
  );
  messages.push({
    role: "tool",
    tool_call_id: call.id,
    content: JSON.stringify(result),
  });
}
```

### Anthropic

```ts
const response = await anthropic.messages.create({
  model: "claude-opus-4-7",
  tools: toAnthropicTools(tools),
  messages,
});

for (const block of response.content) {
  if (block.type !== "tool_use") continue;
  const result = await executeToolCall(
    tools,
    block.name,
    block.input as Record<string, unknown>,
  );
  // append a tool_result block to the next user turn:
  // { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) }
}
```

`executeToolCall` is just a `find(...)` + `execute(args)` — feel free to dispatch yourself if you'd rather keep control.

## Errors

Failed requests throw `ParallelError` with `status` (HTTP status) and `message`.

```ts
import { Parallel, ParallelError } from "@parallel/sdk";

try {
  await parallel.wallets.transfer(id, { to, amount: "1000000" });
} catch (err) {
  if (err instanceof ParallelError && err.status === 400) {
    // bad input
  }
  throw err;
}
```

## Changelog

### 0.3.0

- New: `agentTools(parallel, { walletId, entityId? })` — a framework-agnostic tool layer for agent loops.
- New: `toOpenAITools` / `toAnthropicTools` adapters and an `executeToolCall` dispatcher.

### 0.2.0

- **Breaking:** the `agents.*` namespace has been removed. Use `wallets.*` plus the new `entities.*` namespace instead.
- New: optional `entityId` on `wallets.transfer` for per-call attribution.

### 0.1.0

- Initial release.

## License

MIT
