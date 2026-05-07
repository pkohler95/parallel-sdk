import type { ParallelTool } from "./tools";

/**
 * Convert Parallel agent tools into the OpenAI Chat Completions /
 * Agents SDK tool shape.
 *
 * @example
 * ```ts
 * const tools = agentTools(parallel, { walletId, entityId });
 * const openaiTools = toOpenAITools(tools);
 * const response = await openai.chat.completions.create({
 *   model: "gpt-4o",
 *   messages,
 *   tools: openaiTools,
 * });
 * ```
 */
export function toOpenAITools(tools: ParallelTool[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Convert Parallel agent tools into the Anthropic Messages API tool shape.
 *
 * @example
 * ```ts
 * const tools = agentTools(parallel, { walletId, entityId });
 * const response = await anthropic.messages.create({
 *   model: "claude-opus-4-7",
 *   tools: toAnthropicTools(tools),
 *   messages,
 * });
 * ```
 */
export function toAnthropicTools(tools: ParallelTool[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/**
 * Run a tool by name. The agent loop's universal dispatcher: pass whatever
 * tool name + arguments your LLM emitted, get back the tool's result (or a
 * thrown error you can hand back to the model).
 *
 * @example
 * ```ts
 * for (const call of response.tool_calls ?? []) {
 *   const result = await executeToolCall(
 *     tools,
 *     call.function.name,
 *     JSON.parse(call.function.arguments),
 *   );
 *   messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
 * }
 * ```
 */
export async function executeToolCall(
  tools: ParallelTool[],
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(
      `Unknown Parallel tool: "${name}". Known: ${tools
        .map((t) => t.name)
        .join(", ")}`,
    );
  }
  return tool.execute(args as never);
}
