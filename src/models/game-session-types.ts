/* eslint-disable @typescript-eslint/naming-convention */
import {AvatarPreset} from './character-sheet-types';
import {DamageDefenses} from '../services/character-sheet/combat-features';
import {CombatEncounterDetail} from './combat-types';
import {MonsterRevealCard} from '../services/monster-reveal';

export interface GameSession {
  id_game_session: string;
  session_name: string;
  session_code: string;
  max_player_quantity: number;
  dm_name: string;
  user_id: string | null;
  created_at?: Date;
}

export interface NpcSessionInput {
  id_character: number;
}

export interface MonsterSessionInput {
  monster_api_slug: string;
  custom_name?: string;
  hp_current: number;
  hp_max: number;
  ac: number;
  data_snapshot: Record<string, unknown>;
  image_url?: string | null;
}

/**
 * Adiciona um monstro a uma sessão em andamento — ou a partir de um monstro já catalogado
 * (`id_monster_catalog`) ou catalogando um novo na hora (`monster_api_slug`), exatamente um
 * dos dois deve ser informado.
 */
export interface AddMonsterToSessionInput {
  id_monster_catalog?: string;
  monster_api_slug?: string;
  custom_name?: string;
}

export interface AddPlayerInput {
  session_code: string;
  /** Preenchido pelo service com o nome de usuário (1.9.0) — o que o cliente mandar é ignorado. */
  player_name?: string;
  id_character: number;
  user_id?: string;
}

export interface GrantXpInput {
  xp_amount: number;
  /** Cada jogador/NPC listado recebe o valor cheio de `xp_amount` (não é dividido entre eles). */
  id_player_sessions?: string[];
  id_npc_sessions?: string[];
}

export type PartyRestType = 'short' | 'long';

export interface PartyRestInput {
  rest_type: PartyRestType;
  id_player_sessions?: string[];
  id_npc_sessions?: string[];
}

export interface PartyRestResult {
  /** Nomes dos personagens que descansaram. */
  rested: string[];
  /** Quem ficou de fora (descanso longo exige PV > 0) — nome e motivo. */
  skipped: {name: string; reason: string}[];
}

export interface GrantXpResult {
  participant_type: 'player' | 'npc';
  /** Setado quando participant_type === 'player'. */
  id_player_session?: string;
  /** Setado quando participant_type === 'npc'. */
  id_npc_session?: string;
  id_character: number;
  character_name: string;
  xp_points: number;
  level: number;
}

export interface CreateGameSessionInput {
  session_name: string;
  session_code: string;
  max_player_quantity: number;
  /** Preenchido pelo service com o nome de usuário (1.9.0) — o que o cliente mandar é ignorado. */
  dm_name?: string;
  npcs?: NpcSessionInput[];
  monsters?: MonsterSessionInput[];
}

export interface NpcSession {
  id_npc_session: string;
  id_game_session: string;
  id_character: number;
  character: PlayerCharacterSummary | null;
}

export interface PlayerCharacterSummary {
  name: string;
  class: string;
  race: string;
  level: number;
  max_hit_points: number;
  current_hit_points: number;
  /** Amortecedor de dano à parte do PV normal — pode deixar o total acima do máximo (regra do
   *  livro: nunca acumula com uma vida temporária existente, cura nunca a restaura). */
  temporary_hit_points: number;
  experience_points: number;
  /** XP total pra chegar ao próximo nível (`null` no 20) — barra de XP do card na sessão. */
  next_level_xp: number | null;
  avatar_preset: AvatarPreset | null;
  /** Foto de verdade (via Supabase Storage), à parte do avatar_preset — usada como fundo do
   *  toast de rolagem na sessão. */
  image_url: string | null;
  /** Resistências e reações pra quem aplica dano nele (ver `damageDefensesFor`) — vem no
   *  detalhe da sessão; ausente nos retornos de adicionar jogador/NPC. */
  defenses?: DamageDefenses;
}

export interface PlayerSession {
  id_player_session: string;
  id_game_session: string;
  id_character: number;
  player_name: string;
  user_id: string | null;
  character: PlayerCharacterSummary | null;
}

/** Chaves de atributo dentro de `MonsterSession.data_snapshot` (chaves no formato da dnd5eapi, em inglês). */
export type MonsterAbilityKey =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma';

export interface MonsterSession {
  id_monster_session: string;
  id_game_session: string;
  monster_api_slug: string;
  custom_name?: string;
  hp_current: number;
  hp_max: number;
  ac: number;
  data_snapshot: Record<string, unknown>;
  is_revealed: boolean;
  image_url: string | null;
  /** Usos das ações (recarga, por dia, lendárias, reação, covil) — 1.11.0. Nulo = nada gasto. */
  action_state?: unknown;
  /** Descrição do bestiário (pela slug; nula em ficha antiga) — só no detalhe da sessão. */
  lore?: string | null;
}

/**
 * Versão pública de um monstro revelado — só o que os jogadores podem ver: nome, imagem e a
 * carta (tipo, tamanho, descrição), sem status/PV.
 */
export interface RevealedMonster extends MonsterRevealCard {
  id_monster_session: string;
  name: string;
  image_url: string | null;
}

export interface GameSessionCreated {
  game_session: GameSession;
  npcs: NpcSession[];
  monsters: MonsterSession[];
}

export type RollType =
  | 'dice'
  | 'attack'
  | 'damage'
  | 'skill'
  | 'save'
  | 'spell'
  | 'initiative'
  | 'heal';
export type AdvantageState = 'normal' | 'advantage' | 'disadvantage';

export interface RollLogEntry {
  id_roll: string;
  id_game_session: string;
  id_character: number | null;
  actor_name: string;
  roll_type: RollType;
  label: string;
  dice_notation: string;
  rolls: number[];
  advantage_state: AdvantageState;
  modifier: number;
  total: number;
  created_at: Date;
  /** Rolagem oculta do mestre — não aparece pros jogadores (nem no log, nem no toast/socket). */
  is_hidden: boolean;
}

export interface RollLogInput {
  id_character: number | null;
  actor_name: string;
  roll_type: RollType;
  label: string;
  dice_notation: string;
  rolls: number[];
  advantage_state: AdvantageState;
  modifier: number;
  total: number;
  /** Só o mestre pode marcar como oculta — o service ignora esse campo pra quem não é dono da sessão. */
  is_hidden?: boolean;
  /** Resposta do jogador a um teste secreto pedido pelo mestre: a rolagem fica oculta (só o
   *  mestre recebe; o jogador vê o resultado no próprio modal). */
  secret_request_id?: string;
  /** Rolagem de um lançamento de magia (aviso único da mesa, 1.5.0): não é gravado, só vai no
   *  evento `roll_added` pra mesa não abrir o aviso de rolagem avulso. */
  cast_id?: string;
}

/** O que o mestre pede no teste secreto — o jogador rola com o bônus da própria ficha. */
export type SecretRollCheck =
  | {kind: 'skill'; id_skill: number}
  | {kind: 'save'; ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'};

export interface SecretRollRequestInput {
  id_player_sessions: string[];
  check: SecretRollCheck;
  /** Nome do teste exibido pro jogador e no log do mestre (ex.: "Percepção"). */
  label: string;
}

/** Anúncio de "jogador lançou uma magia" — só informativo, não persiste (ao contrário da
 *  rolagem): existe só pra disparar o toast em tela de todo mundo na sessão via socket. */
export interface SpellCastInput {
  id_character: number;
  actor_name: string;
  spell_name: string;
  /** Magia de resistência: CD e atributo que os alvos rolam — aparece no toast da mesa. */
  save_dc?: number | null;
  save_ability?: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA' | null;
  /** Habilidade de classe (não magia): o toast diz "USOU" em vez de "LANÇOU". */
  is_ability?: boolean;
}

/** Magia mostrada como carta no aviso de lançamento (sem a descrição, pra o evento ficar leve). */
export interface SpellCardInfo {
  id_spell: number;
  name: string;
  casting_time: string | null;
  range_distance: number | null;
  duration: string | null;
  is_verbal: boolean;
  is_somatic: boolean;
  is_material: boolean;
  spellLevel: number;
  school: string | null;
}

export const CAST_ROLL_KINDS = ['attack', 'damage', 'heal'] as const;
export const CAST_ROLL_OUTCOMES = ['pending', 'hit', 'miss'] as const;

/** Rolagem que faz parte do lançamento (o id é o da rolagem já registrada em /roll). */
/** Dano/cura do lançamento já aplicado num alvo (mostrado no aviso, no lugar do aviso avulso). */
export interface CastStageApplied {
  label: string;
  amount: number;
  kind: 'damage' | 'heal' | 'temp_hp';
}

export interface CastStageRoll {
  id_roll: string;
  kind: (typeof CAST_ROLL_KINDS)[number];
  /** Só ataque: aguardando a decisão, acertou ou errou. */
  outcome: (typeof CAST_ROLL_OUTCOMES)[number] | null;
  critical: boolean;
}

/**
 * Etapa de um lançamento de magia (1.5.0): quem lança manda a situação inteira a cada passo
 * (rolou o ataque, decidiu acerto/erro, rolou o dano, terminou) e a mesa mostra um aviso só,
 * com o card do personagem, a carta da magia e as rolagens. Não é gravado.
 */
/**
 * Arma do ataque mostrada como carta no aviso (1.6.1). Vem do cliente já calculada pro personagem
 * (bônus e modificador dependem da ficha); `id_weapon` null = ataque desarmado.
 */
export interface WeaponCardInfo {
  id_weapon: number | null;
  name: string;
  attack_bonus: number;
  damage_modifier: number;
  damage_die: string | null;
  damage_type: string | null;
  properties: string | null;
  weight: number | null;
  is_ranged: boolean;
}

export interface SpellCastStageInput {
  cast_id: string;
  id_character: number;
  actor_name: string;
  /** Magia lançada — ou `weapon` (ataque com arma), um dos dois. */
  id_spell?: number | null;
  weapon?: WeaponCardInfo | null;
  /** `open`: ainda decidindo (o aviso fica); `done`: acabou (o aviso some depois de alguns
   *  segundos); `cancel`: fechou sem rolar nada (o aviso some na hora). */
  phase: 'open' | 'done' | 'cancel';
  rolls: CastStageRoll[];
  /** O que quem lança já aplicou nos alvos (opcional; clientes antigos não mandam). */
  applied?: CastStageApplied[];
  save_dc?: number | null;
  save_ability?: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA' | null;
}

/**
 * Aplicar no alvo o resultado de uma rolagem de dano/cura feita por `id_character`. O servidor
 * calcula o PV (o cliente manda só a quantidade), então o jogador pode aplicar em aliados e em
 * monstros revelados sem conseguir gravar um PV qualquer.
 */
export interface ApplyAmountInput {
  id_character: number;
  target_kind: 'player' | 'npc' | 'monster';
  target_id: string;
  amount: number;
  kind: 'damage' | 'heal' | 'temp_hp';
  /** Aplicação feita dentro de um lançamento: a mesa mostra no aviso dele, sem aviso avulso. */
  cast_id?: string;
}

export interface GameSessionDetail {
  game_session: GameSession;
  players: PlayerSession[];
  npcs: NpcSession[];
  /** Só preenchido para o mestre — jogadores recebem sempre um array vazio aqui. */
  monsters: MonsterSession[];
  /** Monstros revelados pelo mestre — visível para todos, sem status/PV. */
  revealed_monsters: RevealedMonster[];
  recent_rolls: RollLogEntry[];
  combat: CombatEncounterDetail | null;
  /** Imagem de referência que o mestre está mostrando agora (todos veem) — `null` se nenhuma. */
  shown_reference_image: ShownReferenceImage | null;
}

/** Imagem da biblioteca do mestre numa sessão (só o mestre lista). */
export interface ReferenceImage {
  id_reference_image: string;
  id_game_session: string;
  image_url: string;
  title: string | null;
  created_at: Date;
}

/** O que os jogadores recebem da imagem em exibição. */
export interface ShownReferenceImage {
  id_reference_image: string;
  image_url: string;
  title: string | null;
}

export interface GameSessionSummary {
  id_game_session: string;
  session_name: string;
  session_code: string;
  max_player_quantity: number;
  dm_name: string;
  user_id: string | null;
  created_at: Date;
  total_count: number;
}

export interface GameSessionPagedList {
  GameSessionPagedList: GameSessionSummary[];
  page: number;
  pageSize: number;
  total_count: number;
}
