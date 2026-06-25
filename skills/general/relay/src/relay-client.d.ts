export type RelayRequestOptions = {
  method?: string;
  body?: unknown;
  searchParams?: Record<string, unknown>;
};

export type CreateRelayClientOptions = {
  baseUrl?: string | null;
  root?: string;
  throwOnMissing?: boolean;
};

export type RelayEventItem = {
  seq: number;
  status: "message" | "closed";
  inReplyTo?: number | null;
  reason?: string;
  payload: unknown;
  createdAt: string;
};

export type RelayReceiveResult = {
  relayId: string;
  appName: string;
  after: number;
  nextAfter: number;
  items: RelayEventItem[];
};

export type RelaySummary = {
  relayId: string;
  appName: string;
  lifecycle: "open" | "closed";
  state: "agent_turn" | "agent_connected" | "waiting_for_agent" | "idle" | null;
  attention: boolean;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_RELAY_PORT: number;
export function relayRoot(): string;
export function relayDbPath(root?: string): string;
export function relayUrl(port?: string | number): string;
export function readRelayHealth(url: string, options?: { root?: string | null; timeoutMs?: number }): Promise<Record<string, unknown>>;
export function discoverRelayUrl(options?: CreateRelayClientOptions & { explicitUrl?: string | null }): Promise<string | null>;

export class RelayClient {
  baseUrl: string;
  constructor(options: { baseUrl: string });
  request(pathname: string, options?: RelayRequestOptions): Promise<any>;
  listRelays(options?: { appName?: string | null; lifecycle?: string | null; status?: string | null; limit?: number | null }): Promise<{ status: "relays"; limit: number; truncated: boolean; relays: RelaySummary[] }>;
  health(): Promise<any>;
  openRelay(options: { appName: string; payload?: unknown }): Promise<any>;
  send(options: { relayId: string; payload?: unknown }): Promise<any>;
  receive(options: { relayId: string; after?: number }): Promise<RelayReceiveResult>;
  received(options: { relayId: string; through: number }): Promise<any>;
  closeRelay(options: { relayId: string; reason?: string; payload?: unknown }): Promise<any>;
}

export function createRelayClient(options?: CreateRelayClientOptions): Promise<RelayClient | null>;
