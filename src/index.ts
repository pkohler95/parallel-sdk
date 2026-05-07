import type {
  CreateEntityParams,
  CreateWalletParams,
  Entity,
  EntityDetails,
  EntityId,
  ParallelOptions,
  TransferParams,
  Wallet,
  WalletDetails,
  WalletId,
  WalletWithBalance,
} from "./types";

export * from "./types";
export {
  agentTools,
  type AgentToolOptions,
  type ParallelTool,
} from "./tools";
export {
  executeToolCall,
  toAnthropicTools,
  toOpenAITools,
} from "./adapters";

const DEFAULT_BASE_URL = "http://localhost:3000";

export class ParallelError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ParallelError";
  }
}

export class Parallel {
  readonly wallets: WalletsResource;
  readonly entities: EntitiesResource;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ParallelOptions) {
    if (!opts?.apiKey) {
      throw new Error("Parallel: `apiKey` is required.");
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error(
        "Parallel: no global fetch found. Provide one via `opts.fetch` (Node 20+ ships with fetch).",
      );
    }
    const request = this.request.bind(this);
    this.wallets = new WalletsResource(request);
    this.entities = new EntitiesResource(request);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      let msg = `Parallel API error ${res.status}`;
      if (parsed && typeof parsed === "object" && "error" in parsed) {
        const inner = (parsed as { error?: { message?: unknown } }).error
          ?.message;
        if (typeof inner === "string" && inner.length > 0) msg = inner;
      }
      throw new ParallelError(res.status, msg);
    }

    return parsed as T;
  }
}

type Request = <T>(method: string, path: string, body?: unknown) => Promise<T>;

class WalletsResource {
  constructor(private readonly request: Request) {}

  async create(params: CreateWalletParams): Promise<Wallet> {
    return this.request<Wallet>("POST", "/api/v1/wallets", { name: params.name });
  }

  async list(): Promise<WalletWithBalance[]> {
    const res = await this.request<{ wallets: WalletWithBalance[] }>(
      "GET",
      "/api/v1/wallets",
    );
    return res.wallets;
  }

  async get(id: WalletId): Promise<WalletDetails> {
    return this.request<WalletDetails>("GET", `/api/v1/wallets/${id}`);
  }

  async fund(id: WalletId): Promise<{ txHash: string }> {
    return this.request<{ txHash: string }>(
      "POST",
      `/api/v1/wallets/${id}/fund`,
    );
  }

  async transfer(
    id: WalletId,
    params: TransferParams,
  ): Promise<{ txHash: string }> {
    return this.request<{ txHash: string }>(
      "POST",
      `/api/v1/wallets/${id}/transfer`,
      {
        to: params.to,
        amount: params.amount,
        ...(params.entityId ? { entityId: params.entityId } : {}),
      },
    );
  }
}

class EntitiesResource {
  constructor(private readonly request: Request) {}

  async create(params: CreateEntityParams): Promise<Entity> {
    return this.request<Entity>("POST", "/api/v1/entities", {
      walletId: params.walletId,
      name: params.name,
      type: params.type,
    });
  }

  async get(id: EntityId): Promise<EntityDetails> {
    return this.request<EntityDetails>("GET", `/api/v1/entities/${id}`);
  }

  async delete(id: EntityId): Promise<{ ok: true }> {
    return this.request<{ ok: true }>("DELETE", `/api/v1/entities/${id}`);
  }
}
