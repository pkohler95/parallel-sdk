export type WalletId = string;
export type EntityId = string;

export type EntityType = "agent" | "service" | "other";
export type TransactionType = "FUND" | "TRANSFER_OUT" | "TRANSFER_IN";
export type TransactionStatus = "pending" | "confirmed" | "failed";

export interface Wallet {
  id: WalletId;
  name: string;
  walletAddress: string;
  createdAt: string;
}

export interface WalletWithBalance extends Wallet {
  balance: string;
  entityCount: number;
}

export interface Entity {
  id: EntityId;
  name: string;
  type: string;
  walletId: WalletId;
  createdAt: string;
}

export interface EntityRef {
  id: EntityId;
  name: string;
  type: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: string;
  toAddress: string | null;
  fromAddress: string | null;
  txHash: string | null;
  status: TransactionStatus;
  entity: EntityRef | null;
  createdAt: string;
}

export interface WalletDetails extends Wallet {
  balance: string;
  entities: Entity[];
  transactions: Transaction[];
}

export interface EntityDetails extends Entity {
  wallet: { id: WalletId; name: string; walletAddress: string };
  totalSpent: string;
  totalReceived: string;
  net: string;
  transactionCount: number;
  transactions: Omit<Transaction, "entity">[];
}

export interface CreateWalletParams {
  name: string;
}

export interface TransferParams {
  to: string;
  amount: string;
  entityId?: EntityId;
}

export interface CreateEntityParams {
  walletId: WalletId;
  name: string;
  type: EntityType | string;
}

export interface ParallelOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}
