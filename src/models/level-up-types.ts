/* eslint-disable @typescript-eslint/naming-convention */
import {StatKeyEn} from './character-sheet-types';

export interface LevelUpFeaturePreview {
  name: string;
  description: string;
}

export interface LevelUpFeatOption {
  id_feat: string;
  display_name: string;
  description: string;
}

export interface LevelUpSubclassOption {
  id_subclass: string;
  display_name: string;
  /** O que essa opção concederia já neste nível, se escolhida (pra mostrar antes de confirmar). */
  features: LevelUpFeaturePreview[];
}

/** Conjuração concedida pela subclasse escolhida (ex: Cavaleiro Arcano) em vez da classe base. */
export interface LevelUpSubclassSpellcasting {
  spell_list_class_id: number;
  allowed_schools: string[];
}

/**
 * Quantas magias/truques novos o personagem pode aprender neste nível.
 * `spells_gained` é um pool livre (Bardo/Bruxo/Feiticeiro/Ranger/Mago — distribuível entre
 * qualquer círculo acessível); `spells_gained_by_circle` é exclusivo de Clérigo/Druida/Paladino
 * (cada círculo tem sua própria cota, igual ao fluxo de criação de personagem).
 */
export interface LevelUpSpellChoices {
  cantrips_gained: number;
  spells_gained: number;
  spells_gained_by_circle: Record<string, number>;
  already_known_spell_ids: number[];
}

/**
 * Especialização/Aptidão (Ladino nível 6, Bardo nível 3/10): dobra o bônus de proficiência em
 * `count` perícias já treinadas pelo personagem — o frontend já tem a lista de treinadas/já
 * especializadas na ficha carregada, não precisa mandar catálogo nenhum aqui.
 */
export interface LevelUpExpertiseChoice {
  count: number;
}

/** O que muda ao subir de nível, calculado sem gravar nada — pra tela de revisão. */
export interface LevelUpPreview {
  id_class: number;
  current_level: number;
  next_level: number;
  hit_die: number;
  con_modifier: number;
  /** Bônus fixo de PV por nível de sub-raça (ex: Tenacidade Anã do Anão da Colina) — 0 se não houver. */
  hp_bonus_per_level: number;
  proficiency_bonus: number;
  is_asi_level: boolean;
  new_features: LevelUpFeaturePreview[];
  resources: Record<string, string> | null;
  spell_slots_total: Record<string, number> | null;
  feat_options: LevelUpFeatOption[];
  spell_choices: LevelUpSpellChoices | null;
  /** Só populado no nível em que a classe escolhe subclasse e o personagem ainda não tem uma. */
  subclass_options: LevelUpSubclassOption[] | null;
  subclass_spellcasting: LevelUpSubclassSpellcasting | null;
  expertise_choice: LevelUpExpertiseChoice | null;
}

/** Resultado da rolagem do dado de vida — feita pelo jogador, sob demanda, sem gravar nada. */
export interface LevelUpHitDieRoll {
  hit_die_roll: number;
}

export type AsiOrFeatChoice =
  | {type: 'asi'; increases: Partial<Record<StatKeyEn, number>>}
  | {type: 'feat'; feat_id: string};

export interface LevelUpConfirmInput {
  hit_die_roll: number;
  asi_or_feat?: AsiOrFeatChoice;
  new_spell_ids?: number[];
  /** Obrigatório só no nível em que a classe escolhe subclasse e o personagem ainda não tem uma. */
  id_subclass?: string;
  /** Obrigatório só no nível em que a classe concede Especialização/Aptidão (ver `expertise_choice` no preview). */
  expertise_skill_ids?: number[];
}

export interface LevelUpResult {
  level: number;
  hp_gained: number;
  max_hit_points: number;
  current_hit_points: number;
  proficiency_bonus: number;
  hit_dice: string;
  spell_save_dc: number | null;
  spell_attack_bonus: number | null;
  id_subclass: string | null;
  updated_attributes: Partial<
    Record<StatKeyEn, {score: number; modifier: number}>
  >;
}
