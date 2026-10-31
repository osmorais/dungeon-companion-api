/* eslint-disable @typescript-eslint/naming-convention */
import {SpellCardDamage} from '../../models/character-options-types';
import {
  SPELL_MECHANICS,
  SpellMechanics,
  resolveSpellRollAtSlot,
} from './spell-mechanics';

/**
 * Dano (ou cura) da magia pro selo da carta (1.17.0): o valor base do livro, no círculo da magia
 * (truque: no nível 1 do personagem). A ficha mostra o valor do personagem, calculado no web a
 * partir do `roll`; isto aqui vale pro catálogo, a criação de ficha, a tela de lançamento e as
 * magias de dano que ainda não têm mecânica.
 */

/**
 * Magias de dano sem mecânica cadastrada (o modal não rola): só o que a carta mostra, conferido
 * com `referencias/magias.txt` em 2026-10-31. Ganhou mecânica em `spell-mechanics.ts`, sai daqui.
 */
export const SPELL_CARD_DAMAGE_EXTRA: Record<
  number,
  SpellCardDamage & {name: string}
> = {
  16: {
    name: 'Animar Objetos',
    dice: '1d4+4',
    type: 'concussão',
    kind: 'damage',
  },
  26: {name: 'Armadura de Agathys', dice: '5', type: 'frio', kind: 'damage'},
  38: {name: 'Auxílio Divino', dice: '+1d4', type: 'radiante', kind: 'damage'},
  41: {
    name: 'Barreira de Lâminas',
    dice: '6d10',
    type: 'cortante',
    kind: 'damage',
  },
  47: {
    name: 'Bordão Místico',
    dice: '1d8 + mod',
    type: 'concussão',
    kind: 'damage',
  },
  81: {name: 'Conjurar Rajada', dice: '3d8', type: 'da arma', kind: 'damage'},
  96: {
    name: 'Cordão de Flechas',
    dice: '1d6',
    type: 'perfurante',
    kind: 'damage',
  },
  98: {
    name: 'Crescer Espinhos',
    dice: '2d4',
    type: 'perfurante',
    kind: 'damage',
  },
  147: {
    name: 'Escudo de Fogo',
    dice: '2d8',
    type: 'fogo ou frio',
    kind: 'damage',
  },
  163: {
    name: 'Flecha Relampejante',
    dice: '4d8',
    type: 'elétrico',
    kind: 'damage',
  },
  166: {
    name: 'Força Fantasmagórica',
    dice: '1d6',
    type: 'psíquico',
    kind: 'damage',
  },
  174: {
    name: 'Golpe Constritor',
    dice: '1d6',
    type: 'perfurante',
    kind: 'damage',
  },
  175: {name: 'Guardião da Fé', dice: '20', type: 'radiante', kind: 'damage'},
  206: {name: 'Malogro', dice: '8d8', type: 'necrótico', kind: 'damage'},
  212: {
    name: 'Marca da Punição',
    dice: '+2d6',
    type: 'radiante',
    kind: 'damage',
  },
  233: {
    name: 'Muralha de Vento',
    dice: '3d8',
    type: 'concussão',
    kind: 'damage',
  },
  234: {
    name: 'Muralha Prismática',
    dice: '10d6',
    type: 'varia',
    kind: 'damage',
  },
  240: {name: 'Nuvem de Adagas', dice: '4d4', type: 'cortante', kind: 'damage'},
  253: {
    name: 'Palavra de Poder Matar',
    dice: 'MORTE',
    type: 'até 100 PV',
    kind: 'damage',
  },
  295: {name: 'Rajada Prismática', dice: '10d6', type: 'varia', kind: 'damage'},
  314: {
    name: 'Rogar Maldição',
    dice: '+1d8',
    type: 'necrótico',
    kind: 'damage',
  },
  318: {
    name: 'Saraivada de Espinhos',
    dice: '1d10',
    type: 'perfurante',
    kind: 'damage',
  },
  324: {name: 'Símbolo', dice: '10d10', type: 'necrótico', kind: 'damage'},
  328: {name: 'Sonho', dice: '3d6', type: 'psíquico', kind: 'damage'},
  339: {
    name: 'Tempestade da Vingança',
    dice: '2d6',
    type: 'trovejante',
    kind: 'damage',
  },
  343: {name: 'Terremoto', dice: '5d6', type: 'concussão', kind: 'damage'},
};

/** "3× 1d4+1", "2d8 + 4d6", "1d8 + mod" — o mesmo formato que o web usa pro valor da ficha. */
export function formatSpellDice(
  entry: {
    instances: number;
    dice_count: number;
    dice_sides: number;
    modifier: number;
    extra_dice: {count: number; sides: number}[];
  },
  opts: {castingMod?: boolean; rider?: boolean} = {},
): string {
  let text = `${entry.dice_count}d${entry.dice_sides}`;
  if (entry.modifier)
    text += entry.modifier > 0 ? `+${entry.modifier}` : `${entry.modifier}`;
  for (const extra of entry.extra_dice)
    text += ` + ${extra.count}d${extra.sides}`;
  if (opts.castingMod) text += ' + mod';
  if (entry.instances > 1) text = `${entry.instances}× ${text}`;
  return opts.rider ? `+${text}` : text;
}

function fromMechanics(
  mechanics: SpellMechanics,
  spellLevel: number,
): SpellCardDamage | null {
  // Nível 1 do personagem e modificador 0: o valor base; o "+ mod" vem escrito.
  const entry = resolveSpellRollAtSlot(mechanics, spellLevel, spellLevel, 1, 0);
  if (!entry) return null;
  const dice = formatSpellDice(entry, {
    castingMod: !!mechanics.addCastingMod,
    rider: mechanics.kind === 'rider',
  });
  if (mechanics.heal) {
    return {dice, type: null, kind: mechanics.heal.tempHp ? 'temp_hp' : 'heal'};
  }
  return {dice, type: mechanics.damage?.type ?? null, kind: 'damage'};
}

/** Selo da carta: da mecânica, ou do cadastro só de exibição; `null` em magia sem dano/cura. */
export function spellCardDamage(
  idSpell: number,
  spellLevel: number,
): SpellCardDamage | null {
  const mechanics = SPELL_MECHANICS[idSpell];
  const computed = mechanics ? fromMechanics(mechanics, spellLevel) : null;
  if (computed) return computed;
  const extra = SPELL_CARD_DAMAGE_EXTRA[idSpell];
  return extra ? {dice: extra.dice, type: extra.type, kind: extra.kind} : null;
}

/** Junta o `card_damage` numa magia vinda do banco (catálogo, opções, ficha, aviso). */
export function withCardDamage<
  T extends {id_spell: number; spellLevel: number},
>(spell: T): T & {card_damage: SpellCardDamage | null} {
  return {
    ...spell,
    card_damage: spellCardDamage(spell.id_spell, spell.spellLevel),
  };
}
