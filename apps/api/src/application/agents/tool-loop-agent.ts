import type { AgentPort, AgentResult, AgentStop, AgentTask, AgentTool } from '../ports/agent.port';
import type { LlmContent, LlmMessage, LlmPort } from '../ports/llm.port';
import type { LoggerPort } from '../ports/logger.port';

/**
 * Manual tool-use loop over LlmPort (ADR 0010). Owning the loop gives hard turn and cost caps and
 * keeps every turn a plain request/response pair, so the record/replay fixtures cover agents too.
 *
 * History is append-only: assistant turns are pushed back exactly as received (including opaque
 * thinking blocks), and all tool results of a turn go back in one user message.
 */
export class ToolLoopAgent implements AgentPort {
  constructor(
    private readonly llm: LlmPort,
    private readonly logger: LoggerPort,
  ) {}

  async run(task: AgentTask): Promise<AgentResult> {
    const tools = new Map<string, AgentTool>(task.tools.map((t) => [t.name, t]));
    const messages: LlmMessage[] = [
      { role: 'user', content: [{ type: 'text', text: task.prompt }] },
    ];
    const result: AgentResult = {
      stop: 'max-turns',
      final: null,
      turns: 0,
      toolCalls: [],
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      replayed: true,
    };
    const finish = (stop: AgentStop): AgentResult => {
      result.stop = stop;
      this.logger.info('agent finished', {
        purpose: task.purpose,
        stop,
        turns: result.turns,
        toolCalls: result.toolCalls.length,
        costUsd: Number(result.costUsd.toFixed(4)),
        replayed: result.replayed,
      });
      return result;
    };

    while (result.turns < task.limits.maxTurns) {
      if (result.costUsd >= task.limits.maxCostUsd) return finish('cost-cap');
      const response = await this.llm.complete({
        purpose: task.purpose,
        model: task.model,
        system: task.system,
        messages,
        tools: task.tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
        maxTokens: task.maxTokensPerTurn,
        effort: task.effort,
      });
      result.turns++;
      result.costUsd += response.usage.costUsd;
      result.inputTokens += response.usage.inputTokens;
      result.outputTokens += response.usage.outputTokens;
      result.replayed &&= response.source === 'fixture';
      messages.push({ role: 'assistant', content: response.content });

      if (response.stopReason === 'refusal') return finish('refusal');
      const calls = response.content.filter(
        (c): c is Extract<LlmContent, { type: 'tool_use' }> => c.type === 'tool_use',
      );
      if (calls.length === 0)
        return finish(response.stopReason === 'max_tokens' ? 'max-tokens' : 'no-tool-call');

      const results: LlmContent[] = [];
      let submitted = false;
      for (const call of calls) {
        const tool = tools.get(call.name);
        const out = tool
          ? await safeRun(tool, call.input)
          : { content: `Unknown tool: ${call.name}`, isError: true };
        result.toolCalls.push({ name: call.name, isError: out.isError === true });
        this.logger.debug('agent tool call', {
          purpose: task.purpose,
          turn: result.turns,
          tool: call.name,
          isError: out.isError === true,
        });
        if (out.final !== undefined && !out.isError) {
          result.final = out.final;
          submitted = true;
        }
        results.push({
          type: 'tool_result',
          toolUseId: call.id,
          content: out.content,
          isError: out.isError,
        });
      }
      if (submitted) return finish('submitted');
      messages.push({ role: 'user', content: results });
    }
    return finish('max-turns');
  }
}

async function safeRun(tool: AgentTool, input: unknown) {
  try {
    return await tool.run(input);
  } catch (e) {
    return { content: `Tool failed: ${(e as Error).message}`, isError: true };
  }
}
