export interface AiTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {type: string; description: string}>;
    required: string[];
  };
}

export interface IAiProvider {
  /** Single-turn chat, returns the text response. */
  chat(systemPrompt: string, userMessage: string): Promise<string>;

  /** Agentic loop with tools. Calls toolExecutor for each tool call until the model stops. */
  chatWithTools(
    systemPrompt: string,
    userMessage: string,
    tools: AiTool[],
    toolExecutor: (name: string, input: Record<string, unknown>) => string,
  ): Promise<string>;
}
