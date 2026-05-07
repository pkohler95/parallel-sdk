import type { Parallel } from "./index";
import type { EntityId, WalletId } from "./types";

/**
 * Agent-facing tools. Bind to a wallet (and optionally an entity for
 * attribution), then expose the resulting array to whatever LLM framework
 * your agent uses. Adapters in `./adapters` turn these into OpenAI /
 * Anthropic tool shapes; `executeToolCall` runs them.
 */
export interface ParallelTool<TArgs = Record<string, unknown>> {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (args: TArgs) => Promise<unknown>;
}

export interface AgentToolOptions {
  /** The wallet this agent acts from. Required. */
  walletId: WalletId;
  /**
   * Optional entity to auto-attribute outgoing transfers to. If supplied,
   * every `send_usdc` call this agent makes is tagged with this entity ID.
   */
  entityId?: EntityId;
}

export type JSONSchema = {
  type: "object";
  properties: Record<string, JSONSchemaProp>;
  required?: string[];
  additionalProperties?: boolean;
};

type JSONSchemaProp =
  | { type: "string"; description?: string; enum?: string[] }
  | {
      type: "number" | "integer";
      description?: string;
      minimum?: number;
      maximum?: number;
    }
  | { type: "boolean"; description?: string };

/**
 * Build the standard set of tools an agent needs to act on its own wallet.
 *
 * @example
 * ```ts
 * const tools = agentTools(parallel, {
 *   walletId: agent.walletId,
 *   entityId: agent.entityId, // optional but recommended
 * });
 * const openai = toOpenAITools(tools);
 * ```
 */
export function agentTools(
  parallel: Parallel,
  opts: AgentToolOptions,
): ParallelTool[] {
  const { walletId, entityId } = opts;
  if (!walletId) {
    throw new Error("agentTools: `walletId` is required.");
  }

  const getBalance: ParallelTool<Record<string, never>> = {
    name: "get_wallet_balance",
    description:
      "Get the current USDC balance of this agent's wallet on Base Sepolia. Use this whenever you need to know how much you can spend.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      const w = await parallel.wallets.get(walletId);
      return {
        address: w.walletAddress,
        balance: w.balance,
        currency: "USDC",
      };
    },
  };

  const getInfo: ParallelTool<Record<string, never>> = {
    name: "get_wallet_info",
    description:
      "Get the agent's own wallet details: name, on-chain address, current balance, and which entity (if any) the agent's spend is attributed to.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      const w = await parallel.wallets.get(walletId);
      return {
        walletId: w.id,
        walletName: w.name,
        address: w.walletAddress,
        balance: w.balance,
        currency: "USDC",
        network: "base-sepolia",
        entityId: entityId ?? null,
        entityName: entityId
          ? (w.entities.find((e) => e.id === entityId)?.name ?? null)
          : null,
        entitiesOnWallet: w.entities.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
        })),
      };
    },
  };

  const getTransactions: ParallelTool<{ limit?: number }> = {
    name: "get_recent_transactions",
    description:
      "List the most recent transactions on this agent's wallet, including incoming transfers, outgoing transfers, and faucet funding events. Use this to check whether a payment landed or to summarize recent activity.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description:
            "Maximum number of transactions to return (1-50). Defaults to 10.",
          minimum: 1,
          maximum: 50,
        },
      },
      additionalProperties: false,
    },
    async execute({ limit }) {
      const cap = clampInt(limit, 1, 50, 10);
      const w = await parallel.wallets.get(walletId);
      return {
        walletAddress: w.walletAddress,
        transactions: w.transactions.slice(0, cap).map((t) => ({
          type: t.type,
          amount: t.amount,
          currency: "USDC",
          counterparty:
            t.type === "TRANSFER_OUT"
              ? t.toAddress
              : t.type === "TRANSFER_IN"
                ? t.fromAddress
                : null,
          status: t.status,
          txHash: t.txHash,
          entity: t.entity ? t.entity.name : null,
          createdAt: t.createdAt,
        })),
      };
    },
  };

  const sendUsdc: ParallelTool<{ to: string; amount: string }> = {
    name: "send_usdc",
    description:
      "Send USDC from this agent's wallet to another address on Base Sepolia. Returns the transaction hash. The transfer is automatically attributed to this agent's entity if one was configured.",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description:
            "Recipient EVM address (must start with 0x). Validate before calling — there is no undo.",
        },
        amount: {
          type: "string",
          description:
            "USDC amount as a decimal string with up to 6 decimal places, e.g. \"0.50\" or \"1.25\".",
        },
      },
      required: ["to", "amount"],
      additionalProperties: false,
    },
    async execute({ to, amount }) {
      if (typeof to !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
        throw new Error(
          "send_usdc: `to` must be a 0x-prefixed 40-char hex address.",
        );
      }
      if (typeof amount !== "string" || !/^\d+(\.\d{1,6})?$/.test(amount)) {
        throw new Error(
          "send_usdc: `amount` must be a positive decimal string with up to 6 decimals.",
        );
      }

      const res = await parallel.wallets.transfer(walletId, {
        to,
        amount,
        ...(entityId ? { entityId } : {}),
      });
      return {
        txHash: res.txHash,
        explorerUrl: `https://sepolia.basescan.org/tx/${res.txHash}`,
        status: "submitted",
      };
    },
  };

  return [getBalance, getInfo, getTransactions, sendUsdc] as ParallelTool[];
}

function clampInt(
  v: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof v === "number" ? Math.floor(v) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
