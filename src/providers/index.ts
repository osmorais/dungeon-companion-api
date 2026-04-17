import {AnthropicProvider} from './anthropic.provider';
import {OpenAiProvider} from './openai.provider';
import {IAiProvider} from './ai-provider.interface';

export {IAiProvider, AiTool} from './ai-provider.interface';

export function createAiProvider(): IAiProvider {
  const provider = (process.env.AI_PROVIDER ?? 'anthropic').toLowerCase();
  if (provider === 'openai') return new OpenAiProvider();
  return new AnthropicProvider();
}
