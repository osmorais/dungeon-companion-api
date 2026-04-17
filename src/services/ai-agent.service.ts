import {injectable, BindingScope} from '@loopback/core';
import * as dotenv from 'dotenv';
import {createAiProvider, IAiProvider, AiTool} from '../providers';

dotenv.config();

// --- Tool implementations (executed server-side) ---

function rollDice(notation: string): number {
  const match = notation.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) throw new Error(`Invalid dice notation: ${notation}`);
  const count = parseInt(match[1]);
  const sides = parseInt(match[2]);
  const modifier = match[3] ? parseInt(match[3]) : 0;
  let total = modifier;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total;
}

function getClassFeatures(className: string, level: number): object {
  const features: Record<string, Record<number, string[]>> = {
    fighter: {
      1: ['Fighting Style', 'Second Wind'],
      2: ['Action Surge'],
      3: ['Martial Archetype'],
      5: ['Extra Attack'],
    },
    wizard: {
      1: ['Spellcasting', 'Arcane Recovery'],
      2: ['Arcane Tradition'],
      5: ['5th-level Spells'],
    },
    rogue: {
      1: ['Expertise', 'Sneak Attack', "Thieves' Cant"],
      2: ['Cunning Action'],
      3: ['Roguish Archetype'],
      5: ['Uncanny Dodge'],
    },
  };
  const classKey = className.toLowerCase();
  const classData = features[classKey] ?? {};
  const unlocked: string[] = [];
  for (const [lvl, feats] of Object.entries(classData)) {
    if (parseInt(lvl) <= level) unlocked.push(...feats);
  }
  return {className, level, features: unlocked};
}

function executeTool(name: string, input: Record<string, unknown>): string {
  if (name === 'roll_dice') {
    const result = rollDice(input.notation as string);
    return JSON.stringify({notation: input.notation, result});
  }
  if (name === 'get_class_features') {
    const result = getClassFeatures(input.class_name as string, input.level as number);
    return JSON.stringify(result);
  }
  throw new Error(`Unknown tool: ${name}`);
}

// --- Tool definitions (provider-agnostic format) ---

const DND_TOOLS: AiTool[] = [
  {
    name: 'roll_dice',
    description:
      'Roll dice using standard D&D notation (e.g. "4d6", "1d20+3"). Use this to determine ability scores, HP, and other random values.',
    inputSchema: {
      type: 'object',
      properties: {
        notation: {type: 'string', description: 'Dice notation like "4d6", "2d8+3", "1d20"'},
      },
      required: ['notation'],
    },
  },
  {
    name: 'get_class_features',
    description: "Look up a D&D 5e class's features for a given level.",
    inputSchema: {
      type: 'object',
      properties: {
        class_name: {type: 'string', description: 'The class name, e.g. "fighter"'},
        level: {type: 'number', description: 'Character level (1-20)'},
      },
      required: ['class_name', 'level'],
    },
  },
];

// ---------------------------------------------------------------------------

@injectable({scope: BindingScope.TRANSIENT})
export class AiAgentService {
  private provider: IAiProvider;

  constructor() {
    this.provider = createAiProvider();
  }

  async generateCharacter(characterClass: string, level: number): Promise<object> {
    const systemPrompt = `
      You are 'The Forge', an expert D&D 5e Dungeon Master assistant.
      Your job is to generate character sheets.
      You must reply ONLY with a valid JSON object and absolutely no other text.
      The JSON must contain exactly these keys:
      - name (string)
      - race (string)
      - class (string)
      - level (number)
      - hp (number)
      - armorClass (number)
      - stats (object with str, dex, con, int, wis, cha as numbers)
      - inventory (array of strings)
    `;

    const raw = await this.provider.chat(systemPrompt, `Generate a level ${level} ${characterClass}.`);
    return parseJson(raw);
  }

  async generateCharacterWithTools(characterClass: string, level: number): Promise<object> {
    const systemPrompt = `
      You are 'The Forge', an expert D&D 5e Dungeon Master assistant.
      Use the roll_dice tool to roll 4d6 for each of the six ability scores (take the total),
      then use get_class_features to fetch the class features.
      Finally, reply ONLY with a valid JSON object with these keys:
      - name (string)
      - race (string)
      - class (string)
      - level (number)
      - hp (number)
      - armorClass (number)
      - stats (object with str, dex, con, int, wis, cha as numbers — use your dice results)
      - features (array of strings from get_class_features)
      - inventory (array of strings)
    `;

    const raw = await this.provider.chatWithTools(
      systemPrompt,
      `Generate a level ${level} ${characterClass}.`,
      DND_TOOLS,
      executeTool,
    );
    return parseJson(raw);
  }
}

function parseJson(text: string): object {
  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('The AI did not return valid JSON.');
  }
}
