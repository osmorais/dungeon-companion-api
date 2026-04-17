import Anthropic from '@anthropic-ai/sdk';
import {AiTool, IAiProvider} from './ai-provider.interface';

export class AnthropicProvider implements IAiProvider {
  private client: Anthropic;
  private chatModel: string;
  private agentModel: string;

  constructor() {
    this.client = new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY});
    this.chatModel = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
    this.agentModel = process.env.ANTHROPIC_AGENT_MODEL ?? 'claude-opus-4-7';
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.chatModel,
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{role: 'user', content: userMessage}],
    });
    const block = response.content[0];
    return block.type === 'text' ? block.text : '';
  }

  async chatWithTools(
    systemPrompt: string,
    userMessage: string,
    tools: AiTool[],
    toolExecutor: (name: string, input: Record<string, unknown>) => string,
  ): Promise<string> {
    const anthropicTools: Anthropic.Tool[] = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));

    const messages: Anthropic.MessageParam[] = [{role: 'user', content: userMessage}];

    while (true) {
      const response = await this.client.messages.create({
        model: this.agentModel,
        max_tokens: 4096,
        system: systemPrompt,
        tools: anthropicTools,
        messages,
      });

      messages.push({role: 'assistant', content: response.content});

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find(b => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') throw new Error('No text in final response');
        return textBlock.text;
      }

      if (response.stop_reason === 'tool_use') {
        const toolResults: Anthropic.ToolResultBlockParam[] = response.content
          .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
          .map(tc => {
            try {
              const output = toolExecutor(tc.name, tc.input as Record<string, unknown>);
              return {type: 'tool_result', tool_use_id: tc.id, content: output};
            } catch (err) {
              return {type: 'tool_result', tool_use_id: tc.id, content: String(err), is_error: true};
            }
          });
        messages.push({role: 'user', content: toolResults});
        continue;
      }

      throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
    }
  }
}
