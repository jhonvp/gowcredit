import type { LlmModelSlot, LlmTool } from './llm.port';

/**
 * Bounded tool-use agents (ADR 0010). An agent only proposes: the tool that ends the run returns
 * a value the caller validates with the domain before using it.
 */
export interface AgentToolResult {
  content: string;
  isError?: boolean;
  /** Set by the terminal tool (e.g. `submit_extraction`): ends the run with this value. */
  final?: unknown;
}

export interface AgentTool extends LlmTool {
  run(input: unknown): Promise<AgentToolResult> | AgentToolResult;
}

export interface AgentLimits {
  /** Model calls, including the one that submits. */
  maxTurns: number;
  /** Stop before a turn that would start above this spend. */
  maxCostUsd: number;
}

export interface AgentTask {
  purpose: string;
  model: LlmModelSlot;
  system: string;
  prompt: string;
  tools: AgentTool[];
  limits: AgentLimits;
  maxTokensPerTurn: number;
  effort?: 'low' | 'medium' | 'high';
}

export type AgentStop =
  'submitted' | 'max-turns' | 'cost-cap' | 'no-tool-call' | 'max-tokens' | 'refusal';

export interface AgentResult {
  stop: AgentStop;
  /** Value from the terminal tool, when `stop === 'submitted'`. */
  final: unknown;
  turns: number;
  toolCalls: { name: string; isError: boolean }[];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  /** True if every turn came from recorded fixtures. */
  replayed: boolean;
}

export interface AgentPort {
  run(task: AgentTask): Promise<AgentResult>;
}

export const AGENT_PORT = Symbol('AgentPort');
