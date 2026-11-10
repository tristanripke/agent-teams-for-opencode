// The shapes the Desktop panel reads from the plugin's user RPCs. The RPC schemas leave outputs open, so the
// client casts to these in api.ts.
import type { Context } from '@opencode/plugin/gui';

export type Model = { providerID: string; id: string; variant?: string };
export type Peer = { sessionID: string; name: string; role: string; directory: string; projectID?: string;
  archived?: boolean; model?: Model; registered?: boolean; activity?: 'running' | 'idle';
  waitingFor?: 'approval' | 'input';
  // Set by the panel so a changed list never reuses another session's row.
  id?: string };
// A session that may no longer be known: only its ID is certain.
export type PeerRef = Partial<Peer> & { sessionID: string };
export type Team = { id: string; name: string; members: string[] };
export type Connection = { id: string; members: string[]; expiresAt: number; active: boolean; closed?: boolean;
  closedAt?: number };
export type Message = { id: string; from: string; to: string; sender: Peer; recipient: Peer; text: string;
  status: string; at: number };
export type AuditEntry = { at: number; actor: string; action: string; data?: Record<string, unknown> };
export type ScopeCounts = { messages: number; activity: number };
export type Snapshot = { revision: number; capabilities: Record<string, string>; limits: Record<string, number>;
  discovery: { mode: 'registered' | 'automatic'; registered: string[] };
  agents: Peer[]; people: Record<string, Peer>; teams: Team[]; connections: Connection[];
  messages: Message[]; audit: AuditEntry[];
  scopes?: { none: ScopeCounts; general: ScopeCounts; teams: Record<string, ScopeCounts> } };
export type Candidates = { items: Peer[]; total: number; page: number };
export type CandidateQuery = { query: string; page: number; exclude?: string[] };
export type IconName = Parameters<Context['ui']['Icon']>[0]['name'];
