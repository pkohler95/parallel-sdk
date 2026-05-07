# Upgrading Parallel SDK

Each section below is a paste-ready prompt for an AI coding assistant (Claude Code, Cursor, etc.). Copy the section that matches the version you're upgrading from, paste it into the assistant inside your repo, and it will apply the changes.

## 0.2.0 → 0.3.0

You're an AI assistant updating an existing Parallel SDK integration in this codebase from `0.2.0` to `0.3.0`. The release adds a new `agentTools` layer so agents can act on their own wallet inside their LLM tool loop. **Nothing in the existing `wallets.*` / `entities.*` surface has changed.** Do not migrate, rename, or refactor anything else.

### 1. Bump the install

```bash
npm install github:pkohler95/parallel-sdk
# or pin: npm install github:pkohler95/parallel-sdk#v0.3.0
```

The package name is still `@parallel/sdk` — imports don't change.

### 2. Find every place an agent makes its own LLM call

Scan the host codebase. You're looking for places that call OpenAI / Anthropic / the OpenAI Agents SDK / LangGraph / Mastra / etc. — anywhere an LLM is invoked with a `tools` array. For each one, determine which agent in the host app it belongs to.

### 3. For each agent, locate the `walletId` and (if present) `entityId`

When this codebase first integrated Parallel, it called `parallel.wallets.create` and probably `parallel.entities.create`, then persisted the returned `id`s alongside whatever the app already keeps about that agent (DB row, config, etc.). Find them.

If the codebase doesn't currently persist `entityId`, check whether each agent should have one. If yes, add it; if not, leave it out — `agentTools` works with `walletId` alone.

### 4. Build the tool set and merge it into the agent's tool list

For each agent's LLM call:

```ts
import {
  agentTools,
  toOpenAITools,        // or toAnthropicTools
  executeToolCall,
} from "@parallel/sdk";

const parallelTools = agentTools(parallel, {
  walletId: agent.walletId,
  entityId: agent.entityId, // optional but recommended — auto-tags spend
});

const response = await openai.chat.completions.create({
  model: agent.model,
  messages,
  tools: [...existingTools, ...toOpenAITools(parallelTools)],
});
```

For Anthropic, swap `toOpenAITools` for `toAnthropicTools` and use `tools: toAnthropicTools(parallelTools)` on `anthropic.messages.create`.

### 5. Route tool calls through the dispatcher

In the existing tool-call handler, route Parallel tool names through `executeToolCall`. The cleanest pattern:

```ts
const PARALLEL_TOOL_NAMES = new Set([
  "get_wallet_balance",
  "get_wallet_info",
  "get_recent_transactions",
  "send_usdc",
]);

for (const call of response.choices[0].message.tool_calls ?? []) {
  let result: unknown;
  if (PARALLEL_TOOL_NAMES.has(call.function.name)) {
    result = await executeToolCall(
      parallelTools,
      call.function.name,
      JSON.parse(call.function.arguments),
    );
  } else {
    result = await existingDispatcher(call); // whatever the host already has
  }
  messages.push({
    role: "tool",
    tool_call_id: call.id,
    content: JSON.stringify(result),
  });
}
```

For Anthropic, look for `content` blocks of type `"tool_use"` and append a `{ type: "tool_result", tool_use_id, content }` block to the next user turn.

### 6. Verify

Ask the agent (in plain English): "What's the address and balance of your wallet?"

It should respond with real on-chain data instead of saying it doesn't know. Then ask: "Send 0.01 USDC to 0x000000000000000000000000000000000000dEaD." It should call `send_usdc` and report a transaction hash.

Refresh the Parallel dashboard for that wallet — the new transaction should appear, attributed to the right entity.

### 7. Report back

Tell the user:

- Which agent files you touched.
- Where each `walletId` / `entityId` came from in the existing code.
- Any agents you found but couldn't wire up (so they can patch by hand).
- The verification result for each.
