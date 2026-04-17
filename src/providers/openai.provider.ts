import OpenAI from 'openai';
import {AiTool, IAiProvider} from './ai-provider.interface';

export class OpenAiProvider implements IAiProvider {
  private client: OpenAI;
  private chatModel: string;
  private agentModel: string;

  constructor() {
    this.client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
    this.chatModel = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    this.agentModel = process.env.OPENAI_AGENT_MODEL ?? 'gpt-4o';
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.chatModel,
      messages: [
        {role: 'system', content: systemPrompt},
        {role: 'user', content: userMessage},
      ],
    });
    return response.choices[0].message.content ?? '';
  }

  async chatWithTools(
    systemPrompt: string,
    userMessage: string,
    tools: AiTool[],
    toolExecutor: (name: string, input: Record<string, unknown>) => string,
  ): Promise<string> {
    const openAiTools: OpenAI.Chat.ChatCompletionTool[] = tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {role: 'system', content: systemPrompt},
      {role: 'user', content: userMessage},
    ];

    while (true) {
      const response = await this.client.chat.completions.create({
        model: this.agentModel,
        messages,
        tools: openAiTools,
        tool_choice: 'auto',
      });

      const choice = response.choices[0];
      messages.push(choice.message);

      if (choice.finish_reason === 'stop') {
        return choice.message.content ?? '';
      }

      if (choice.finish_reason === 'tool_calls') {
        for (const tc of choice.message.tool_calls ?? []) {
          if (tc.type !== 'function') continue;
          let content: string;
          try {
            content = toolExecutor(tc.function.name, JSON.parse(tc.function.arguments) as Record<string, unknown>);
          } catch (err) {
            content = String(err);
          }
          messages.push({role: 'tool', tool_call_id: tc.id, content});
        }
        continue;
      }

      throw new Error(`Unexpected finish_reason: ${choice.finish_reason}`);
    }
  }
}
