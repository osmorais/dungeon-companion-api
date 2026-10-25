/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {GameSessionRepository} from '../repositories/game-session.repository';
import {CombatService} from './combat.service';
import {SessionEventsService} from './session-events.service';
import {MonsterCatalogService} from './monster-catalog.service';
import {SupabaseStorageService} from './supabase-storage.service';
import {ImageCleanupService} from './image-cleanup.service';
import {CharacterSheetService} from './character-sheet.service';
import {xpNeededForLevel} from './character-sheet/rules';
import {
  AddMonsterToSessionInput,
  AddPlayerInput,
  ApplyAmountInput,
  AdvantageState,
  CreateGameSessionInput,
  GameSessionCreated,
  GameSessionDetail,
  GameSessionPagedList,
  GrantXpInput,
  GrantXpResult,
  MonsterAbilityKey,
  MonsterSession,
  NpcSession,
  PartyRestInput,
  PartyRestResult,
  ReferenceImage,
  RevealedMonster,
  PlayerSession,
  RollLogEntry,
  RollLogInput,
  RollType,
  SpellCastStageInput,
  WeaponCardInfo,
  CAST_ROLL_KINDS,
  CAST_ROLL_OUTCOMES,
  SecretRollRequestInput,
  ShownReferenceImage,
  SpellCastInput,
} from '../models/game-session-types';
import {bardicInspirationSides} from './character-sheet/combat-features';
import {startingInventory} from './character-sheet/starting-items';
import {applyHpAmount} from './hp-math';
import {monsterRevealCard} from './monster-reveal';
import {
  MonsterActionState,
  applyActionOp,
  normalizeActionState,
  parseActionOp,
} from './monster-action-state';
import {
  applyStats,
  manualHpStats,
  rollStats,
  StatDelta,
} from './ranking-stats';
import {
  SecretRollRequestStore,
  secretRollRequests,
} from './secret-roll-requests';

const ROLL_TYPES: RollType[] = [
  'dice',
  'attack',
  'damage',
  'skill',
  'save',
  'spell',
  'initiative',
  'heal',
];
const ADVANTAGE_STATES: AdvantageState[] = [
  'normal',
  'advantage',
  'disadvantage',
];

const SKILL_IDS_MAX = 18;
const SAVE_ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

/** Maior quantidade aceita ao aplicar dano/cura de uma rolagem. */
const APPLY_AMOUNT_MAX = 9999;

/** Imagens de referência por sessão (cada uma até 10 MB, igual aos outros uploads). */
const REFERENCE_IMAGE_LIMIT = 30;
const REFERENCE_IMAGE_TITLE_MAX = 120;
/** Limite das anotações do mestre (Quadro do Mestre). */
const DM_NOTES_MAX_LENGTH = 10_000;

@injectable({scope: BindingScope.TRANSIENT})
export class GameSessionService {
  /** Pedidos de teste secreto pendentes (processo inteiro); substituível nos testes. */
  secretRequests: SecretRollRequestStore = secretRollRequests;

  constructor(
    @service(GameSessionRepository)
    private repository: GameSessionRepository,
    @service(CombatService)
    private combatService: CombatService,
    @service(SessionEventsService)
    private events: SessionEventsService,
    @service(MonsterCatalogService)
    private monsterCatalogService: MonsterCatalogService,
    @service(SupabaseStorageService)
    private storageService: SupabaseStorageService,
    @service(ImageCleanupService)
    private imageCleanup: ImageCleanupService,
    // Registrado à mão no application.ts (dois bindings) — ver "Injeção de dependência" no CLAUDE.md.
    @inject('services.CharacterSheetService')
    private characterSheetService: CharacterSheetService,
  ) {}

  async createSession(
    input: CreateGameSessionInput,
    userId: string,
  ): Promise<GameSessionCreated> {
    const {session_name, session_code, max_player_quantity} = input;

    if (!session_name?.trim())
      throw new HttpErrors.UnprocessableEntity('Nome da sessão é obrigatório');
    if (!session_code?.trim())
      throw new HttpErrors.UnprocessableEntity(
        'Código da sessão é obrigatório',
      );
    if (!max_player_quantity || max_player_quantity < 1)
      throw new HttpErrors.UnprocessableEntity(
        'Quantidade máxima de jogadores deve ser pelo menos 1',
      );
    // O mestre aparece com o nome de usuário (1.9.0); o que vier em dm_name é ignorado.
    const dmName = await this.requireUsername(userId);

    try {
      return await this.repository.createSession({...input, dm_name: dmName}, userId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('unique') ||
        msg.includes('duplicate') ||
        msg.includes('session_code')
      ) {
        throw new HttpErrors.Conflict('Código da sessão já está em uso');
      }
      throw err;
    }
  }

  /**
   * Pode rolar/anunciar/aplicar por esse personagem? Mestre: qualquer um da sessão; jogador: só o
   * próprio. Sem personagem (rolagem livre, monstro, magia do grimório do mestre): **só o mestre**
   * — antes qualquer participante passava e podia registrar rolagem com qualquer nome (1.11.0).
   */
  private async canActFor(
    idGameSession: string,
    idCharacter: number | null,
    userId: string,
  ): Promise<boolean> {
    if (idCharacter === null)
      return this.repository.isSessionOwner(idGameSession, userId);
    return this.repository.canPostRollFor(idGameSession, idCharacter, userId);
  }

  /**
   * Usos das ações de um monstro da mesa (1.11.0): gastar recarga/uso por dia/descanso, ação
   * lendária e reação; restaurar; descanso; covil. Só o mestre. A ficha (`data_snapshot`) diz os
   * limites — a operação que passa do limite volta 422 sem mudar nada.
   */
  async updateMonsterActionState(
    idMonsterSession: string,
    body: unknown,
    userId: string,
  ): Promise<MonsterActionState> {
    const op = parseActionOp(body);
    if (!op) throw new HttpErrors.UnprocessableEntity('Operação inválida');
    const ctx = await this.repository.findMonsterActionContext(idMonsterSession);
    if (!ctx) throw new HttpErrors.NotFound('Monstro não encontrado');
    if (ctx.session_owner_id !== userId)
      throw new HttpErrors.Forbidden('Apenas o mestre controla os usos do monstro');
    const result = applyActionOp(
      ctx.data_snapshot,
      normalizeActionState(ctx.action_state),
      op,
    );
    if ('error' in result) throw new HttpErrors.UnprocessableEntity(result.error);
    await this.repository.writeMonsterActionState(idMonsterSession, result.state);
    this.events.publish({
      type: 'monster_action_state_updated',
      id_game_session: ctx.id_game_session,
      id_monster_session: idMonsterSession,
      action_state: result.state,
    });
    return result.state;
  }

  /** Conta antiga ainda sem nome de usuário não cria nem entra em sessão (o web pede antes). */
  private async requireUsername(userId: string): Promise<string> {
    const username = await this.repository.findUsername(userId);
    if (!username)
      throw new HttpErrors.UnprocessableEntity(
        'Escolha um nome de usuário antes de entrar ou criar uma sessão',
      );
    return username;
  }

  /**
   * Só o dono leva o personagem pra uma sessão (como jogador ou como NPC do mestre) — sem isso,
   * qualquer usuário entrava com o id de um personagem alheio e passava a ver e agir por ele.
   */
  private async assertOwnsCharacter(idCharacter: number, userId: string): Promise<void> {
    const ownerId = await this.repository.findCharacterOwnerId(idCharacter);
    if (ownerId === undefined)
      throw new HttpErrors.NotFound('Personagem não encontrado');
    if (ownerId !== userId)
      throw new HttpErrors.Forbidden('Esse personagem não é seu');
  }

  async addPlayer(
    input: AddPlayerInput,
    userId: string,
  ): Promise<PlayerSession> {
    if (!input.session_code?.trim())
      throw new HttpErrors.UnprocessableEntity(
        'Código da sessão é obrigatório',
      );
    if (!input.id_character)
      throw new HttpErrors.UnprocessableEntity('id_character é obrigatório');

    const session = await this.repository.findSessionByCode(input.session_code);
    if (!session) throw new HttpErrors.NotFound('Sessão não encontrada');

    await this.assertOwnsCharacter(input.id_character, userId);

    const alreadyIn = await this.repository.isUserInSession(
      session.id_game_session,
      userId,
    );
    if (alreadyIn)
      throw new HttpErrors.Conflict('Usuário já está nessa sessão');

    const currentCount = await this.repository.countPlayers(
      session.id_game_session,
    );
    if (currentCount >= session.max_player_quantity) {
      throw new HttpErrors.UnprocessableEntity(
        'A sessão já atingiu o número máximo de jogadores',
      );
    }

    // O jogador aparece com o nome de usuário (1.9.0); o que vier em player_name é ignorado.
    const playerName = await this.requireUsername(userId);
    const kit = await this.repository.findStartingKit(input.id_character);
    const player = await this.repository.addPlayer(
      {...input, player_name: playerName, user_id: userId},
      session.id_game_session,
      kit ? startingInventory(kit.id_class, kit.id_background) : [],
    );
    this.events.publish({
      type: 'player_added',
      id_game_session: session.id_game_session,
      player,
    });
    return player;
  }

  async removeNpc(idNpcSession: string, userId: string): Promise<void> {
    const result = await this.repository.removeNpc(idNpcSession, userId);
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('NPC não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden('Apenas o mestre pode remover NPCs');
    this.events.publish({
      type: 'npc_removed',
      id_game_session: result.idGameSession!,
      id_npc_session: idNpcSession,
    });
  }

  async addNpc(
    idGameSession: string,
    idCharacter: number,
    userId: string,
  ): Promise<NpcSession> {
    const session = await this.repository.findById(idGameSession);
    if (!session)
      throw new HttpErrors.NotFound(
        `Sessão com id ${idGameSession} não encontrada`,
      );
    if (session.game_session.user_id !== userId)
      throw new HttpErrors.Forbidden('Apenas o mestre pode adicionar NPCs');
    await this.assertOwnsCharacter(idCharacter, userId);
    const npc = await this.repository.addNpc(idGameSession, idCharacter);
    this.events.publish({
      type: 'npc_added',
      id_game_session: idGameSession,
      npc,
    });
    return npc;
  }

  /**
   * Adiciona um monstro à sessão — a partir de um monstro já catalogado (`id_monster_catalog`)
   * ou catalogando um novo na hora (`monster_api_slug`), que também fica salvo no bestiário do
   * mestre pra reuso futuro.
   */
  async addMonster(
    idGameSession: string,
    userId: string,
    input: AddMonsterToSessionInput,
  ): Promise<MonsterSession> {
    const session = await this.repository.findById(idGameSession);
    if (!session)
      throw new HttpErrors.NotFound(
        `Sessão com id ${idGameSession} não encontrada`,
      );
    if (session.game_session.user_id !== userId)
      throw new HttpErrors.Forbidden('Apenas o mestre pode adicionar monstros');

    let catalogEntry;
    if (input.id_monster_catalog) {
      catalogEntry = await this.monsterCatalogService.getCatalogEntry(
        input.id_monster_catalog,
        userId,
      );
    } else if (input.monster_api_slug) {
      catalogEntry = await this.monsterCatalogService.catalogMonster(
        userId,
        input.monster_api_slug,
        input.custom_name ?? null,
      );
    } else {
      throw new HttpErrors.BadRequest(
        'Informe id_monster_catalog ou monster_api_slug',
      );
    }

    const monster = await this.repository.addMonsterToSession(idGameSession, {
      monster_api_slug: catalogEntry.monster_api_slug,
      custom_name: catalogEntry.custom_name ?? undefined,
      hp_current: catalogEntry.hp_max,
      hp_max: catalogEntry.hp_max,
      ac: catalogEntry.ac,
      data_snapshot: catalogEntry.data_snapshot,
      image_url: catalogEntry.image_url,
    });
    this.events.publish({
      type: 'monster_added',
      id_game_session: idGameSession,
      monster,
    });
    return monster;
  }

  /** Duplica um monstro já na sessão, copiando todos os dados (inclusive o PV atual) pra uma
   *  linha nova — útil pra "clonar" um monstro que já tomou dano, sem reconfigurar do zero. */
  async duplicateMonster(
    idMonsterSession: string,
    userId: string,
  ): Promise<MonsterSession> {
    const result = await this.repository.duplicateMonster(idMonsterSession, userId);
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Monstro não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden('Apenas o mestre pode duplicar monstros');

    const monster = result.monster!;
    this.events.publish({
      type: 'monster_added',
      id_game_session: monster.id_game_session,
      monster,
    });
    return monster;
  }

  async removeMonster(idMonsterSession: string, userId: string): Promise<void> {
    const result = await this.repository.removeMonster(
      idMonsterSession,
      userId,
    );
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Monstro não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden('Apenas o mestre pode remover monstros');
    this.events.publish({
      type: 'monster_removed',
      id_game_session: result.idGameSession!,
      id_monster_session: idMonsterSession,
    });
    await this.imageCleanup.deleteIfUnreferenced([result.imageUrl]);
  }

  /**
   * Remove o monstro (mesma query de removeMonster) e avisa a todos com o nome, pra notificação de
   * derrota. A imagem **não** é limpa do storage aqui: o modal de derrota de todos os jogadores
   * carrega essa URL logo depois do evento. Se ficar órfã, sai na limpeza manual de órfãs.
   */
  async defeatMonster(idMonsterSession: string, userId: string): Promise<void> {
    const result = await this.repository.removeMonster(
      idMonsterSession,
      userId,
    );
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Monstro não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden(
        'Apenas o mestre pode marcar o monstro como derrotado',
      );
    this.events.publish({
      type: 'monster_defeated',
      id_game_session: result.idGameSession!,
      id_monster_session: idMonsterSession,
      name: result.customName ?? this.monsterSnapshotName(result.dataSnapshot),
      image_url: result.imageUrl ?? null,
      ...monsterRevealCard(result.dataSnapshot, null),
    });
  }

  async removePlayer(idPlayerSession: string, userId: string): Promise<void> {
    const result = await this.repository.removePlayer(idPlayerSession, userId);
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Jogador não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden(
        'Você não pode remover outro jogador da sessão',
      );
    this.events.publish({
      type: 'player_removed',
      id_game_session: result.idGameSession!,
      id_player_session: idPlayerSession,
    });
  }

  async updateCharacterHp(
    idPlayerSession: string,
    currentHitPoints: number,
    temporaryHitPoints: number,
    userId: string,
  ): Promise<{current_hit_points: number}> {
    if (
      typeof currentHitPoints !== 'number' ||
      !Number.isInteger(currentHitPoints)
    ) {
      throw new HttpErrors.UnprocessableEntity(
        'current_hit_points deve ser um número inteiro',
      );
    }
    if (
      typeof temporaryHitPoints !== 'number' ||
      !Number.isInteger(temporaryHitPoints) ||
      temporaryHitPoints < 0
    ) {
      throw new HttpErrors.UnprocessableEntity(
        'temporary_hit_points deve ser um número inteiro não negativo',
      );
    }
    const result = await this.repository.updateCharacterHp(
      idPlayerSession,
      currentHitPoints,
      temporaryHitPoints,
      userId,
    );
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Jogador não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden(
        'Você não tem permissão para alterar a vida deste personagem',
      );
    if (result.idCharacter && result.previous) {
      await this.recordStats(
        result.idGameSession!,
        result.idCharacter,
        manualHpStats(result.previous, {
          current: result.currentHitPoints ?? currentHitPoints,
          temp: temporaryHitPoints,
        }),
      );
    }
    this.events.publish({
      type: 'player_hp_updated',
      id_game_session: result.idGameSession!,
      id_player_session: idPlayerSession,
      current_hit_points: result.currentHitPoints ?? currentHitPoints,
      temporary_hit_points: temporaryHitPoints,
    });
    // Resistência Implacável (Meio-Orc) entrou sozinha: avisa a mesa ("USOU").
    if (result.relentlessEndurance) {
      this.events.publish({
        type: 'spell_cast',
        id_game_session: result.idGameSession!,
        id_character: result.relentlessEndurance.idCharacter,
        actor_name: result.relentlessEndurance.name,
        spell_name: 'Resistência Implacável',
        save_dc: null,
        save_ability: null,
        is_ability: true,
      });
    }
    return {current_hit_points: result.currentHitPoints ?? currentHitPoints};
  }

  /** Só o mestre concede XP; cada jogador selecionado recebe o valor cheio informado (não dividido). */
  async grantXp(
    idGameSession: string,
    input: GrantXpInput,
    userId: string,
  ): Promise<GrantXpResult[]> {
    if (!Number.isInteger(input.xp_amount) || input.xp_amount <= 0) {
      throw new HttpErrors.UnprocessableEntity('xp_amount deve ser um número inteiro positivo');
    }
    const idPlayerSessions = input.id_player_sessions ?? [];
    const idNpcSessions = input.id_npc_sessions ?? [];
    if (!idPlayerSessions.length && !idNpcSessions.length) {
      throw new HttpErrors.UnprocessableEntity('Selecione ao menos um jogador ou NPC');
    }

    const result = await this.repository.grantXp(
      idGameSession,
      input.xp_amount,
      idPlayerSessions,
      idNpcSessions,
      userId,
    );
    if (result.status === 'unauthorized') {
      throw new HttpErrors.Forbidden('Apenas o mestre pode conceder XP');
    }

    for (const grant of result.granted) {
      const xpNeeded = xpNeededForLevel(grant.level);
      // Sempre que o total já é suficiente pro próximo nível — não só quando essa concessão
      // específica cruzou a linha. Um personagem que já estava elegível (de uma concessão
      // anterior) e ainda não subiu de nível continua merecendo o aviso a cada XP novo.
      const canLevelUp = xpNeeded !== null && grant.xp_points >= xpNeeded;

      if (grant.participant_type === 'player') {
        await this.recordStats(idGameSession, grant.id_character, {
          xp_gained: input.xp_amount,
        });
        this.events.publish({
          type: 'player_xp_granted',
          id_game_session: idGameSession,
          id_player_session: grant.id_player_session!,
          character_name: grant.character_name,
          xp_amount: input.xp_amount,
          xp_points: grant.xp_points,
          can_level_up: canLevelUp,
        });
      } else {
        this.events.publish({
          type: 'npc_xp_granted',
          id_game_session: idGameSession,
          id_npc_session: grant.id_npc_session!,
          character_name: grant.character_name,
          xp_amount: input.xp_amount,
          xp_points: grant.xp_points,
          can_level_up: canLevelUp,
        });
      }
    }
    return result.granted;
  }

  /**
   * Mestre declara um descanso pro grupo (jogadores/NPCs escolhidos). Longo: PV cheio, metade dos
   * Dados de Vida, espaços e recursos — mesma regra do descanso individual, e quem está com 0 PV
   * fica de fora. Curto: só recarrega os recursos de descanso curto; cada jogador gasta os
   * próprios Dados de Vida depois, na tela dele.
   */
  async partyRest(
    idGameSession: string,
    input: PartyRestInput,
    userId: string,
  ): Promise<PartyRestResult> {
    if (input?.rest_type !== 'short' && input?.rest_type !== 'long')
      throw new HttpErrors.UnprocessableEntity('rest_type deve ser "short" ou "long"');
    const idPlayerSessions = new Set(input.id_player_sessions ?? []);
    const idNpcSessions = new Set(input.id_npc_sessions ?? []);
    if (!idPlayerSessions.size && !idNpcSessions.size)
      throw new HttpErrors.UnprocessableEntity('Selecione ao menos um jogador ou NPC');
    if (!(await this.repository.isSessionOwner(idGameSession, userId)))
      throw new HttpErrors.Forbidden('Apenas o mestre pode declarar um descanso');

    const session = await this.repository.findById(idGameSession);
    if (!session)
      throw new HttpErrors.NotFound(`Sessão com id ${idGameSession} não encontrada`);

    const targets = [
      ...session.players
        .filter(p => idPlayerSessions.has(p.id_player_session) && p.character)
        .map(p => ({kind: 'player' as const, id: p.id_player_session, idCharacter: p.id_character, character: p.character!})),
      ...session.npcs
        .filter(n => idNpcSessions.has(n.id_npc_session) && n.character)
        .map(n => ({kind: 'npc' as const, id: n.id_npc_session, idCharacter: n.id_character, character: n.character!})),
    ];

    const result: PartyRestResult = {rested: [], skipped: []};
    for (const target of targets) {
      const name = target.character.name;
      if (input.rest_type === 'short') {
        await this.characterSheetService.shortRest(target.idCharacter, userId);
        result.rested.push(name);
        continue;
      }
      if (target.character.current_hit_points <= 0) {
        result.skipped.push({name, reason: 'sem pontos de vida'});
        continue;
      }
      const {current_hit_points} = await this.characterSheetService.longRest(target.idCharacter, userId);
      result.rested.push(name);
      if (target.kind === 'player') {
        this.events.publish({
          type: 'player_hp_updated',
          id_game_session: idGameSession,
          id_player_session: target.id,
          current_hit_points,
          temporary_hit_points: target.character.temporary_hit_points,
        });
      } else {
        this.events.publish({
          type: 'npc_hp_updated',
          id_game_session: idGameSession,
          id_npc_session: target.id,
          current_hit_points,
        });
      }
    }

    if (result.rested.length) {
      this.events.publish({
        type: 'party_rested',
        id_game_session: idGameSession,
        rest_type: input.rest_type,
        character_names: result.rested,
      });
    }
    return result;
  }

  async deleteSession(id: string, userId: string): Promise<void> {
    const result = await this.repository.deleteOwnedSession(id, userId);
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound(`Sessão com id ${id} não encontrada`);
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden('Apenas o mestre pode excluir a sessão');
    this.events.publish({type: 'session_deleted', id_game_session: id});
    await this.imageCleanup.deleteIfUnreferenced(result.imageUrls);
  }

  /** Anotações privadas do mestre — só o dono da sessão lê (não vão no detalhe da sessão). */
  async getDmNotes(idGameSession: string, userId: string): Promise<{notes: string}> {
    const row = await this.repository.findDmNotes(idGameSession);
    if (!row)
      throw new HttpErrors.NotFound(`Sessão com id ${idGameSession} não encontrada`);
    if (row.user_id !== userId)
      throw new HttpErrors.Forbidden('Apenas o mestre pode ver as anotações');
    return {notes: row.dm_notes ?? ''};
  }

  async updateDmNotes(
    idGameSession: string,
    notes: unknown,
    userId: string,
  ): Promise<{notes: string}> {
    if (typeof notes !== 'string')
      throw new HttpErrors.UnprocessableEntity('notes deve ser um texto');
    if (notes.length > DM_NOTES_MAX_LENGTH)
      throw new HttpErrors.UnprocessableEntity(
        `As anotações passam de ${DM_NOTES_MAX_LENGTH} caracteres`,
      );
    const row = await this.repository.findDmNotes(idGameSession);
    if (!row)
      throw new HttpErrors.NotFound(`Sessão com id ${idGameSession} não encontrada`);
    if (row.user_id !== userId)
      throw new HttpErrors.Forbidden('Apenas o mestre pode editar as anotações');
    const value = notes.trim() ? notes : null;
    await this.repository.updateDmNotes(idGameSession, value);
    return {notes: value ?? ''};
  }

  async getSession(id: string, userId: string): Promise<GameSessionDetail> {
    const session = await this.repository.findById(id);
    if (!session)
      throw new HttpErrors.NotFound(`Sessão com id ${id} não encontrada`);

    const hasAccess = await this.repository.hasSessionAccess(id, userId);
    if (!hasAccess)
      throw new HttpErrors.Forbidden('Você não tem acesso a esta sessão');

    const isDm = session.game_session.user_id === userId;
    const revealedMonsters: RevealedMonster[] = session.monsters
      .filter(m => m.is_revealed)
      .map(m => ({
        id_monster_session: m.id_monster_session,
        name: m.custom_name ?? this.monsterSnapshotName(m.data_snapshot),
        image_url: m.image_url,
        ...monsterRevealCard(m.data_snapshot, m.lore),
      }));

    const combat = await this.combatService.getActiveEncounterDetail(id);
    return {
      ...session,
      monsters: isDm ? session.monsters : [],
      revealed_monsters: revealedMonsters,
      recent_rolls: isDm
        ? session.recent_rolls
        : session.recent_rolls.filter(r => !r.is_hidden),
      combat,
    };
  }

  /**
   * Aplica no alvo o dano/cura de uma rolagem feita por `id_character` (mestre ou dono do
   * personagem). O jogador alcança qualquer jogador e NPC da sessão e dá dano em monstro já
   * revelado; o mestre, tudo. O PV é calculado aqui (`applyHpAmount`), nunca vem do cliente.
   */
  async applyAmount(
    idGameSession: string,
    input: ApplyAmountInput,
    userId: string,
  ): Promise<{current_hit_points?: number; temporary_hit_points?: number}> {
    const amount = input?.amount;
    if (!Number.isInteger(amount) || amount < 1 || amount > APPLY_AMOUNT_MAX)
      throw new HttpErrors.UnprocessableEntity(
        `amount deve ser um inteiro entre 1 e ${APPLY_AMOUNT_MAX}`,
      );
    if (!['damage', 'heal', 'temp_hp'].includes(input.kind))
      throw new HttpErrors.UnprocessableEntity('kind inválido');
    if (!['player', 'npc', 'monster'].includes(input.target_kind))
      throw new HttpErrors.UnprocessableEntity('target_kind inválido');
    if (!Number.isInteger(input.id_character))
      throw new HttpErrors.UnprocessableEntity('id_character é obrigatório');
    if (input.cast_id !== undefined && !isCastId(input.cast_id))
      throw new HttpErrors.UnprocessableEntity('cast_id inválido');

    const canAct = await this.canActFor(
      idGameSession,
      input.id_character,
      userId,
    );
    if (!canAct)
      throw new HttpErrors.Forbidden('Você não pode agir por este personagem');
    const isDm = await this.repository.isSessionOwner(idGameSession, userId);

    const target = await this.repository.findApplyTarget(
      idGameSession,
      input.target_kind,
      input.target_id,
    );
    // Monstro escondido não existe pro jogador (nem pra dizer que existe).
    if (!target || (!isDm && !target.is_revealed))
      throw new HttpErrors.NotFound('Alvo não encontrado na sessão');
    if (input.target_kind === 'monster' && !isDm && input.kind !== 'damage')
      throw new HttpErrors.UnprocessableEntity(
        'Jogador só aplica dano em monstros',
      );
    if (input.kind === 'temp_hp' && input.target_kind !== 'player')
      throw new HttpErrors.UnprocessableEntity(
        'Só jogadores recebem PV temporários',
      );

    const next = applyHpAmount(target, amount, input.kind);
    const actorName =
      (await this.repository.findCharacterName(input.id_character)) ?? '—';
    let result: {current_hit_points?: number; temporary_hit_points?: number} =
      {};
    let after = {current: next.current, temp: next.temp};

    if (input.target_kind === 'monster') {
      after = {current: next.current, temp: 0};
      await this.repository.writeMonsterHp(input.target_id, next.current);
      this.events.publish({
        type: 'monster_hp_updated',
        id_game_session: idGameSession,
        id_monster_session: input.target_id,
        hp_current: next.current,
      });
    } else {
      let hp = next.current;
      let relentless: {idCharacter: number; name: string} | null = null;
      if (input.target_kind === 'player' && input.kind === 'damage') {
        const resolved = await this.repository.resolveRelentlessEndurance(
          target.id_character!,
          hp,
        );
        hp = resolved.finalHp;
        relentless = resolved.relentlessEndurance;
      }
      after = {current: hp, temp: next.temp};
      await this.repository.writeCharacterHp(target.id_character!, hp, next.temp);
      if (input.target_kind === 'player') {
        this.events.publish({
          type: 'player_hp_updated',
          id_game_session: idGameSession,
          id_player_session: input.target_id,
          current_hit_points: hp,
          temporary_hit_points: next.temp,
        });
      } else {
        this.events.publish({
          type: 'npc_hp_updated',
          id_game_session: idGameSession,
          id_npc_session: input.target_id,
          current_hit_points: hp,
        });
      }
      if (relentless) {
        this.events.publish({
          type: 'spell_cast',
          id_game_session: idGameSession,
          id_character: relentless.idCharacter,
          actor_name: relentless.name,
          spell_name: 'Resistência Implacável',
          save_dc: null,
          save_ability: null,
          is_ability: true,
        });
      }
      result = {current_hit_points: hp, temporary_hit_points: next.temp};
    }

    const stats = applyStats({
      kind: input.kind,
      targetKind: input.target_kind,
      before: {current: target.current, temp: target.temp},
      after,
    });
    await this.recordStats(idGameSession, input.id_character, stats.actor);
    if (input.target_kind === 'player' && target.id_character)
      await this.recordStats(idGameSession, target.id_character, stats.target);

    this.events.publish({
      type: 'amount_applied',
      id_game_session: idGameSession,
      id_character: input.id_character,
      actor_name: actorName,
      target_label: target.label,
      amount,
      kind: input.kind,
      ...(input.cast_id ? {cast_id: input.cast_id} : {}),
    });
    return result;
  }

  /** Só o mestre pode alterar o PV atual de um NPC. */
  async updateNpcHp(
    idNpcSession: string,
    currentHitPoints: number,
    userId: string,
  ): Promise<void> {
    if (
      typeof currentHitPoints !== 'number' ||
      !Number.isInteger(currentHitPoints)
    ) {
      throw new HttpErrors.UnprocessableEntity(
        'current_hit_points deve ser um número inteiro',
      );
    }
    const result = await this.repository.updateNpcHp(
      idNpcSession,
      currentHitPoints,
      userId,
    );
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('NPC não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden(
        'Apenas o mestre pode alterar a vida deste NPC',
      );
    this.events.publish({
      type: 'npc_hp_updated',
      id_game_session: result.idGameSession!,
      id_npc_session: idNpcSession,
      current_hit_points: currentHitPoints,
    });
  }

  /** Só o mestre pode alterar o PV atual de um monstro. */
  async updateMonsterHp(
    idMonsterSession: string,
    hpCurrent: number,
    userId: string,
  ): Promise<void> {
    if (typeof hpCurrent !== 'number' || !Number.isInteger(hpCurrent)) {
      throw new HttpErrors.UnprocessableEntity(
        'hp_current deve ser um número inteiro',
      );
    }
    const result = await this.repository.updateMonsterHp(
      idMonsterSession,
      hpCurrent,
      userId,
    );
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Monstro não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden(
        'Você não tem permissão para alterar a vida deste monstro',
      );
    this.events.publish({
      type: 'monster_hp_updated',
      id_game_session: result.idGameSession!,
      id_monster_session: idMonsterSession,
      hp_current: hpCurrent,
    });
  }

  private static readonly ABILITY_KEYS: MonsterAbilityKey[] = [
    'strength',
    'dexterity',
    'constitution',
    'intelligence',
    'wisdom',
    'charisma',
  ];

  /** Só o mestre pode editar os status (nome, PV, CA, atributos) de um monstro já adicionado à sessão. */
  async updateMonsterStats(
    idMonsterSession: string,
    userId: string,
    stats: {
      customName?: string | null;
      hpCurrent: number;
      hpMax: number;
      ac: number;
      abilities?: Partial<Record<MonsterAbilityKey, number>>;
    },
  ): Promise<void> {
    if (
      typeof stats.hpCurrent !== 'number' ||
      !Number.isInteger(stats.hpCurrent) ||
      stats.hpCurrent < 0
    ) {
      throw new HttpErrors.UnprocessableEntity(
        'hp_current deve ser um número inteiro não-negativo',
      );
    }
    if (typeof stats.hpMax !== 'number' || !Number.isInteger(stats.hpMax) || stats.hpMax < 1) {
      throw new HttpErrors.UnprocessableEntity('hp_max deve ser um número inteiro maior que zero');
    }
    if (typeof stats.ac !== 'number' || !Number.isInteger(stats.ac) || stats.ac < 0) {
      throw new HttpErrors.UnprocessableEntity('ac deve ser um número inteiro não-negativo');
    }
    let abilities: Partial<Record<MonsterAbilityKey, number>> | undefined;
    if (stats.abilities) {
      abilities = {};
      for (const key of GameSessionService.ABILITY_KEYS) {
        const value = stats.abilities[key];
        if (value === undefined) continue;
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 30) {
          throw new HttpErrors.UnprocessableEntity(
            `${key} deve ser um número inteiro entre 1 e 30`,
          );
        }
        abilities[key] = value;
      }
    }
    const trimmedName = stats.customName?.trim();
    const customName = trimmedName ? trimmedName : null;
    const result = await this.repository.updateMonsterStats(idMonsterSession, userId, {
      customName,
      hpCurrent: stats.hpCurrent,
      hpMax: stats.hpMax,
      ac: stats.ac,
      abilities,
    });
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Monstro não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden(
        'Você não tem permissão para alterar os status deste monstro',
      );
    this.events.publish({
      type: 'monster_stats_updated',
      id_game_session: result.idGameSession!,
      id_monster_session: idMonsterSession,
      custom_name: customName,
      hp_current: stats.hpCurrent,
      hp_max: stats.hpMax,
      ac: stats.ac,
      abilities,
    });
  }

  /** Só o mestre pode trocar a imagem de um monstro já adicionado à sessão. */
  async setMonsterImage(
    idMonsterSession: string,
    userId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<MonsterSession> {
    const imageUrl = await this.storageService.uploadImage(buffer, contentType);
    const result = await this.repository.setMonsterImage(
      idMonsterSession,
      userId,
      imageUrl,
    );
    // O upload acontece antes da checagem de permissão: se a troca não for aceita, o arquivo
    // recém-enviado não é usado por ninguém e não pode ficar no storage.
    if (result.status !== 'ok')
      await this.imageCleanup.deleteIfUnreferenced([imageUrl]);
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Monstro não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden(
        'Apenas o mestre pode alterar a imagem do monstro',
      );
    this.events.publish({
      type: 'monster_image_updated',
      id_game_session: result.idGameSession!,
      id_monster_session: idMonsterSession,
      image_url: imageUrl,
    });
    await this.imageCleanup.deleteIfUnreferenced([result.previousImageUrl]);
    return result.monster!;
  }

  // ---------------------------------------------------------------------------
  // Imagens de referência: o mestre sobe imagens na sessão e mostra uma em tela cheia pra todos
  // ---------------------------------------------------------------------------

  private async assertSessionOwner(
    idGameSession: string,
    userId: string,
  ): Promise<void> {
    const ownerId = await this.repository.findSessionOwnerId(idGameSession);
    if (ownerId === undefined)
      throw new HttpErrors.NotFound('Sessão não encontrada');
    if (ownerId !== userId)
      throw new HttpErrors.Forbidden(
        'Apenas o mestre pode gerenciar as imagens da sessão',
      );
  }

  private async ownedReferenceImage(idReferenceImage: string, userId: string) {
    const image = await this.repository.findReferenceImage(idReferenceImage);
    if (!image) throw new HttpErrors.NotFound('Imagem não encontrada');
    if (image.session_owner_id !== userId)
      throw new HttpErrors.Forbidden(
        'Apenas o mestre pode gerenciar as imagens da sessão',
      );
    return image;
  }

  /** Biblioteca de imagens da sessão — só o mestre vê. */
  async listReferenceImages(
    idGameSession: string,
    userId: string,
  ): Promise<ReferenceImage[]> {
    await this.assertSessionOwner(idGameSession, userId);
    return this.repository.listReferenceImages(idGameSession);
  }

  /**
   * Sobe uma imagem pra biblioteca da sessão. A permissão e o limite são conferidos **antes** do
   * upload, pra não deixar arquivo sem dono no storage.
   */
  async addReferenceImage(
    idGameSession: string,
    userId: string,
    buffer: Buffer,
    contentType: string,
    rawTitle?: string | null,
  ): Promise<ReferenceImage> {
    await this.assertSessionOwner(idGameSession, userId);
    const title = rawTitle?.trim() ? rawTitle.trim() : null;
    if (title && title.length > REFERENCE_IMAGE_TITLE_MAX)
      throw new HttpErrors.UnprocessableEntity(
        `A legenda pode ter até ${REFERENCE_IMAGE_TITLE_MAX} caracteres`,
      );
    const count = await this.repository.countReferenceImages(idGameSession);
    if (count >= REFERENCE_IMAGE_LIMIT)
      throw new HttpErrors.UnprocessableEntity(
        `Limite de ${REFERENCE_IMAGE_LIMIT} imagens por sessão — apague alguma antes`,
      );
    const imageUrl = await this.storageService.uploadImage(buffer, contentType);
    try {
      return await this.repository.addReferenceImage(
        idGameSession,
        imageUrl,
        title,
      );
    } catch (e) {
      await this.imageCleanup.deleteIfUnreferenced([imageUrl]);
      throw e;
    }
  }

  /** Mostra a imagem em tela cheia pra todos da sessão (substitui a que estiver aberta). */
  async showReferenceImage(
    idReferenceImage: string,
    userId: string,
  ): Promise<ShownReferenceImage> {
    const image = await this.ownedReferenceImage(idReferenceImage, userId);
    await this.repository.setShownReferenceImage(
      image.id_game_session,
      image.id_reference_image,
    );
    const shown: ShownReferenceImage = {
      id_reference_image: image.id_reference_image,
      image_url: image.image_url,
      title: image.title,
    };
    this.events.publish({
      type: 'reference_image_shown',
      id_game_session: image.id_game_session,
      image: shown,
    });
    return shown;
  }

  /** Fecha a imagem em exibição pra todos. */
  async hideReferenceImage(idGameSession: string, userId: string): Promise<void> {
    await this.assertSessionOwner(idGameSession, userId);
    await this.repository.setShownReferenceImage(idGameSession, null);
    this.events.publish({
      type: 'reference_image_hidden',
      id_game_session: idGameSession,
      reason: 'hidden',
    });
  }

  /** Apaga da biblioteca (e do storage); se estava em exibição, fecha pra todos. */
  async deleteReferenceImage(
    idReferenceImage: string,
    userId: string,
  ): Promise<void> {
    const image = await this.ownedReferenceImage(idReferenceImage, userId);
    await this.repository.deleteReferenceImage(idReferenceImage);
    if (image.is_shown)
      this.events.publish({
        type: 'reference_image_hidden',
        id_game_session: image.id_game_session,
        reason: 'deleted',
      });
    await this.imageCleanup.deleteIfUnreferenced([image.image_url]);
  }

  /** Só o mestre pode revelar/esconder monstros da sessão. */
  async revealMonster(idMonsterSession: string, userId: string): Promise<void> {
    const result = await this.repository.setMonsterRevealed(
      idMonsterSession,
      true,
      userId,
    );
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Monstro não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden('Apenas o mestre pode revelar o monstro');
    this.events.publish({
      type: 'monster_revealed',
      id_game_session: result.idGameSession!,
      id_monster_session: idMonsterSession,
      name: result.customName ?? this.monsterSnapshotName(result.dataSnapshot),
      image_url: result.imageUrl ?? null,
      ...monsterRevealCard(result.dataSnapshot, result.lore),
    });
    await this.joinActiveCombat(result.idGameSession!, idMonsterSession, userId);
  }

  /**
   * Revelar com combate em andamento coloca o monstro na luta (o caminho inverso já existia:
   * entrar no combate revela). Mesmo efeito do "+ ADICIONAR": entra com a iniciativa rolada e,
   * se o combate já está ativo, no fim da ordem. Monstro que já está na luta fica como está.
   * O anúncio de "monstro revelado" sai antes, então não se repete aqui.
   */
  private async joinActiveCombat(
    idGameSession: string,
    idMonsterSession: string,
    userId: string,
  ): Promise<void> {
    const combat = await this.combatService.getActiveEncounterDetail(idGameSession);
    if (!combat) return;
    if (combat.participants.some(p => p.id_monster_session === idMonsterSession)) return;
    await this.combatService.addParticipants(
      combat.encounter.id_combat_encounter,
      [{participant_type: 'monster', id: idMonsterSession}],
      userId,
    );
  }

  async hideMonster(idMonsterSession: string, userId: string): Promise<void> {
    const result = await this.repository.setMonsterRevealed(
      idMonsterSession,
      false,
      userId,
    );
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Monstro não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden('Apenas o mestre pode esconder o monstro');
    this.events.publish({
      type: 'monster_hidden',
      id_game_session: result.idGameSession!,
      id_monster_session: idMonsterSession,
    });
  }

  private monsterSnapshotName(snapshot: unknown): string {
    return (snapshot as {name?: string} | undefined)?.name ?? 'Monstro';
  }

  async hasSessionAccess(id: string, userId: string): Promise<boolean> {
    return this.repository.hasSessionAccess(id, userId);
  }

  async isSessionOwner(id: string, userId: string): Promise<boolean> {
    return this.repository.isSessionOwner(id, userId);
  }

  async addRoll(
    idGameSession: string,
    input: RollLogInput,
    userId: string,
  ): Promise<RollLogEntry> {
    const hasAccess = await this.repository.hasSessionAccess(
      idGameSession,
      userId,
    );
    if (!hasAccess)
      throw new HttpErrors.Forbidden('Você não tem acesso a esta sessão');

    if (!input.actor_name?.trim())
      throw new HttpErrors.UnprocessableEntity('actor_name é obrigatório');
    if (!input.label?.trim())
      throw new HttpErrors.UnprocessableEntity('label é obrigatório');
    if (!input.dice_notation?.trim())
      throw new HttpErrors.UnprocessableEntity('dice_notation é obrigatório');
    if (!Array.isArray(input.rolls) || input.rolls.length === 0) {
      throw new HttpErrors.UnprocessableEntity(
        'rolls deve conter ao menos um valor',
      );
    }
    if (!ROLL_TYPES.includes(input.roll_type))
      throw new HttpErrors.UnprocessableEntity('roll_type inválido');
    if (!ADVANTAGE_STATES.includes(input.advantage_state)) {
      throw new HttpErrors.UnprocessableEntity('advantage_state inválido');
    }

    const idCharacter = input.id_character ?? null;
    const canPost = await this.canActFor(
      idGameSession,
      idCharacter,
      userId,
    );
    if (!canPost)
      throw new HttpErrors.Forbidden(
        'Você não pode registrar uma rolagem para esse personagem',
      );

    // Resposta a um teste secreto: só vale uma vez, do jogador/personagem pra quem o mestre
    // pediu, e a rolagem fica oculta (só o mestre recebe).
    let answersSecretRequest = false;
    if (input.secret_request_id !== undefined) {
      const request = this.secretRequests.consume(String(input.secret_request_id), {
        id_game_session: idGameSession,
        id_character: idCharacter,
        user_id: userId,
      });
      if (!request)
        throw new HttpErrors.Conflict(
          'Pedido de teste secreto inválido ou expirado',
        );
      answersSecretRequest = true;
    }

    // Fora isso, só o mestre pode ocultar uma rolagem dos jogadores — ignora silenciosamente
    // o campo pra quem não é dono da sessão, em vez de rejeitar a rolagem inteira por causa disso.
    const isDm = input.is_hidden
      ? await this.repository.isSessionOwner(idGameSession, userId)
      : false;

    const castId = input.cast_id;
    if (castId !== undefined && !isCastId(castId))
      throw new HttpErrors.UnprocessableEntity('cast_id inválido');

    const rollInput = {...input};
    delete rollInput.secret_request_id;
    delete rollInput.cast_id;
    const roll = await this.repository.addRoll(idGameSession, {
      ...rollInput,
      id_character: idCharacter,
      is_hidden: answersSecretRequest || (isDm && !!input.is_hidden),
    });
    if (idCharacter !== null)
      await this.recordStats(idGameSession, idCharacter, rollStats(input));
    this.events.publish({
      type: 'roll_added',
      id_game_session: idGameSession,
      roll: castId ? {...roll, cast_id: castId} : roll,
    });
    return roll;
  }

  /**
   * Bardo dá Inspiração Bárdica a um aliado da mesa: o dado (pelo nível do bardo) fica guardado
   * no personagem do aliado até ele usar num teste, ataque ou resistência. O recurso do bardo é
   * gasto pelo "USAR" (endpoint de recursos); aqui só entrega o dado.
   */
  async grantBardicInspiration(
    idGameSession: string,
    input: {id_character: number; id_player_session: string},
    userId: string,
  ): Promise<{sides: number; to: string}> {
    const canAct = await this.canActFor(idGameSession, input.id_character, userId);
    if (!canAct)
      throw new HttpErrors.Forbidden('Você não pode agir por esse personagem');
    const bard = await this.repository.findCharacterBasics(input.id_character);
    if (!bard || bard.id_class !== 2)
      throw new HttpErrors.UnprocessableEntity('Só bardo dá Inspiração Bárdica');
    const session = await this.repository.findById(idGameSession);
    const ally = session?.players.find(p => p.id_player_session === input.id_player_session);
    if (!ally?.character)
      throw new HttpErrors.UnprocessableEntity('Aliado sem personagem ou fora da sessão');
    if (ally.id_character === input.id_character)
      throw new HttpErrors.UnprocessableEntity('A inspiração vai pra outra criatura');
    const sides = bardicInspirationSides(bard.level);
    await this.repository.setBardicInspiration(ally.id_character, {sides, from: bard.name});
    return {sides, to: ally.character.name};
  }

  /**
   * Mestre pede um teste secreto (perícia ou resistência) a um ou mais jogadores: cada um recebe
   * o pedido só na própria tela, rola com o bônus da ficha, e o resultado vai oculto pro mestre.
   */
  async requestSecretRoll(
    idGameSession: string,
    input: SecretRollRequestInput,
    userId: string,
  ): Promise<{id_player_session: string; request_id: string}[]> {
    const isOwner = await this.repository.isSessionOwner(idGameSession, userId);
    if (!isOwner)
      throw new HttpErrors.Forbidden('Só o mestre pede teste secreto');

    const ids = Array.isArray(input.id_player_sessions)
      ? [...new Set(input.id_player_sessions)]
      : [];
    if (ids.length === 0)
      throw new HttpErrors.UnprocessableEntity('Escolha ao menos um jogador');
    const label = typeof input.label === 'string' ? input.label.trim() : '';
    if (!label || label.length > 60)
      throw new HttpErrors.UnprocessableEntity('label inválido');
    const check = input.check;
    const validCheck =
      (check?.kind === 'skill' &&
        Number.isInteger(check.id_skill) &&
        check.id_skill >= 1 &&
        check.id_skill <= SKILL_IDS_MAX) ||
      (check?.kind === 'save' && SAVE_ABILITIES.includes(check.ability));
    if (!validCheck) throw new HttpErrors.UnprocessableEntity('check inválido');

    const session = await this.repository.findById(idGameSession);
    if (!session) throw new HttpErrors.NotFound('Sessão não encontrada');
    const targets = ids.map(id => {
      const player = session.players.find(p => p.id_player_session === id);
      if (!player?.user_id || !player.character)
        throw new HttpErrors.UnprocessableEntity(
          'Jogador sem personagem ou fora da sessão',
        );
      return player;
    });

    return targets.map(player => {
      const request = this.secretRequests.create({
        id_game_session: idGameSession,
        id_player_session: player.id_player_session,
        id_character: player.id_character,
        user_id: player.user_id!,
        label,
      });
      this.events.publish({
        type: 'secret_roll_requested',
        id_game_session: idGameSession,
        target_user_id: player.user_id!,
        request_id: request.id,
        id_player_session: player.id_player_session,
        id_character: player.id_character,
        label,
        check: input.check,
      });
      return {id_player_session: player.id_player_session, request_id: request.id};
    });
  }

  /** Só anuncia (broadcast via socket) — ao contrário de addRoll, não persiste nada, é puramente
   *  informativo pro toast em tela de todo mundo na sessão. */
  async announceSpellCast(
    idGameSession: string,
    input: SpellCastInput,
    userId: string,
  ): Promise<void> {
    const hasAccess = await this.repository.hasSessionAccess(
      idGameSession,
      userId,
    );
    if (!hasAccess)
      throw new HttpErrors.Forbidden('Você não tem acesso a esta sessão');

    if (!input.actor_name?.trim())
      throw new HttpErrors.UnprocessableEntity('actor_name é obrigatório');
    if (!input.spell_name?.trim())
      throw new HttpErrors.UnprocessableEntity('spell_name é obrigatório');
    const saveDc = input.save_dc ?? null;
    const saveAbility = input.save_ability ?? null;
    if ((saveDc === null) !== (saveAbility === null))
      throw new HttpErrors.UnprocessableEntity(
        'save_dc e save_ability vão juntos',
      );
    if (
      saveDc !== null &&
      (!Number.isInteger(saveDc) || saveDc < 1 || saveDc > 40)
    )
      throw new HttpErrors.UnprocessableEntity('save_dc inválido');
    if (
      saveAbility !== null &&
      !['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].includes(saveAbility)
    )
      throw new HttpErrors.UnprocessableEntity('save_ability inválido');

    const canPost = await this.canActFor(
      idGameSession,
      input.id_character,
      userId,
    );
    if (!canPost)
      throw new HttpErrors.Forbidden(
        'Você não pode anunciar uma magia pra esse personagem',
      );

    if (input.is_ability !== true && input.id_character !== null)
      await this.recordStats(idGameSession, input.id_character, {spells_cast: 1});
    this.events.publish({
      type: 'spell_cast',
      id_game_session: idGameSession,
      id_character: input.id_character,
      actor_name: input.actor_name,
      spell_name: input.spell_name,
      save_dc: saveDc,
      save_ability: saveAbility,
      is_ability: input.is_ability === true,
    });
  }

  /**
   * Etapa de um lançamento de magia (1.5.0) ou ataque com arma (1.6.1): só publica (não grava) — a
   * mesa monta um aviso único com o card do personagem, a carta (magia buscada aqui pelo id; arma
   * vinda do cliente, já calculada pro personagem) e as rolagens (já registradas em /roll,
   * referenciadas pelo id). Mesmas permissões de rolar pelo personagem.
   */
  async publishSpellCastStage(
    idGameSession: string,
    input: SpellCastStageInput,
    userId: string,
  ): Promise<void> {
    const hasAccess = await this.repository.hasSessionAccess(
      idGameSession,
      userId,
    );
    if (!hasAccess)
      throw new HttpErrors.Forbidden('Você não tem acesso a esta sessão');

    if (!isCastId(input.cast_id))
      throw new HttpErrors.UnprocessableEntity('cast_id inválido');
    if (!Number.isInteger(input.id_character))
      throw new HttpErrors.UnprocessableEntity('id_character inválido');
    if (!input.actor_name?.trim() || input.actor_name.length > 100)
      throw new HttpErrors.UnprocessableEntity('actor_name é obrigatório');
    const hasSpell = input.id_spell !== undefined && input.id_spell !== null;
    const hasWeapon = input.weapon !== undefined && input.weapon !== null;
    if (hasSpell === hasWeapon)
      throw new HttpErrors.UnprocessableEntity(
        'Informe a magia (id_spell) ou a arma (weapon)',
      );
    if (hasSpell && !Number.isInteger(input.id_spell))
      throw new HttpErrors.UnprocessableEntity('id_spell inválido');
    const weapon = hasWeapon ? validWeaponCard(input.weapon) : null;
    if (hasWeapon && !weapon)
      throw new HttpErrors.UnprocessableEntity('weapon inválida');
    if (!['open', 'done', 'cancel'].includes(input.phase))
      throw new HttpErrors.UnprocessableEntity('phase inválida');
    if (!Array.isArray(input.rolls) || input.rolls.length > 30)
      throw new HttpErrors.UnprocessableEntity('rolls inválido');
    for (const r of input.rolls) {
      if (
        typeof r?.id_roll !== 'string' ||
        !r.id_roll ||
        r.id_roll.length > 64 ||
        !(CAST_ROLL_KINDS as readonly string[]).includes(r.kind) ||
        (r.outcome !== null &&
          !(CAST_ROLL_OUTCOMES as readonly string[]).includes(r.outcome)) ||
        typeof r.critical !== 'boolean'
      )
        throw new HttpErrors.UnprocessableEntity('rolls inválido');
    }
    const applied = input.applied ?? [];
    if (!Array.isArray(applied) || applied.length > 30)
      throw new HttpErrors.UnprocessableEntity('applied inválido');
    for (const a of applied) {
      if (
        !shortText(a?.label, 80) ||
        !Number.isInteger(a.amount) ||
        a.amount < 0 ||
        a.amount > APPLY_AMOUNT_MAX ||
        !['damage', 'heal', 'temp_hp'].includes(a.kind)
      )
        throw new HttpErrors.UnprocessableEntity('applied inválido');
    }
    const saveDc = input.save_dc ?? null;
    const saveAbility = input.save_ability ?? null;
    if ((saveDc === null) !== (saveAbility === null))
      throw new HttpErrors.UnprocessableEntity(
        'save_dc e save_ability vão juntos',
      );
    if (
      saveDc !== null &&
      (!Number.isInteger(saveDc) || saveDc < 1 || saveDc > 40)
    )
      throw new HttpErrors.UnprocessableEntity('save_dc inválido');
    if (
      saveAbility !== null &&
      !['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].includes(saveAbility)
    )
      throw new HttpErrors.UnprocessableEntity('save_ability inválido');

    const canPost = await this.canActFor(
      idGameSession,
      input.id_character,
      userId,
    );
    if (!canPost)
      throw new HttpErrors.Forbidden(
        'Você não pode lançar uma magia por esse personagem',
      );
    const spell = hasSpell
      ? await this.repository.findSpellCard(input.id_spell as number)
      : null;
    if (hasSpell && !spell)
      throw new HttpErrors.NotFound('Magia não encontrada');

    // Conta a magia uma vez, quando o lançamento termina.
    if (hasSpell && input.phase === 'done')
      await this.recordStats(idGameSession, input.id_character, {spells_cast: 1});
    this.events.publish({
      type: 'spell_cast_stage',
      id_game_session: idGameSession,
      cast_id: input.cast_id,
      user_id: userId,
      id_character: input.id_character,
      actor_name: input.actor_name,
      spell,
      weapon,
      phase: input.phase,
      rolls: input.rolls.map(r => ({
        id_roll: r.id_roll,
        kind: r.kind,
        outcome: r.outcome,
        critical: r.critical,
      })),
      applied: applied.map(a => ({
        label: a.label.trim(),
        amount: a.amount,
        kind: a.kind,
      })),
      save_dc: saveDc,
      save_ability: saveAbility,
    });
  }

  /**
   * Estatísticas do ranking: nunca podem atrapalhar a jogada — erro aqui só vai pro log (sem
   * dado pessoal).
   */
  private async recordStats(
    idGameSession: string,
    idCharacter: number,
    delta: StatDelta,
  ): Promise<void> {
    if (!Object.keys(delta).length) return;
    try {
      await this.repository.bumpStats(idGameSession, idCharacter, delta);
    } catch (err) {
      console.error('[ranking] falha ao gravar estatística:', (err as Error).message);
    }
  }

  async listUserSessions(
    userId: string,
    pageSize: number,
    page: number,
    role: 'dm' | 'player' | 'all' = 'all',
  ): Promise<GameSessionPagedList> {
    const rows = await this.repository.findPagedByUser(
      userId,
      pageSize,
      page,
      role,
    );
    return {
      GameSessionPagedList: rows,
      page,
      pageSize,
      total_count: rows[0]?.total_count ?? 0,
    };
  }
}

/** Id do lançamento gerado pelo cliente (uuid ou parecido). */
function isCastId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

const shortText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const optionalText = (value: unknown, max: number): boolean =>
  value === null || shortText(value, max);
const smallInt = (value: unknown, limit: number): value is number =>
  Number.isInteger(value) && Math.abs(value as number) <= limit;

/** Carta da arma vinda do cliente: só campos de exibição, com tamanho e faixa limitados. */
function validWeaponCard(value: unknown): WeaponCardInfo | null {
  const w = value as Partial<WeaponCardInfo> | null | undefined;
  if (!w || typeof w !== 'object') return null;
  const ok =
    (w.id_weapon === null || smallInt(w.id_weapon, 100000)) &&
    shortText(w.name, 100) &&
    smallInt(w.attack_bonus, 50) &&
    smallInt(w.damage_modifier, 50) &&
    optionalText(w.damage_die, 20) &&
    optionalText(w.damage_type, 40) &&
    optionalText(w.properties, 300) &&
    (w.weight === null ||
      (typeof w.weight === 'number' && w.weight >= 0 && w.weight <= 1000)) &&
    typeof w.is_ranged === 'boolean';
  if (!ok) return null;
  return {
    id_weapon: w.id_weapon as number | null,
    name: w.name as string,
    attack_bonus: w.attack_bonus as number,
    damage_modifier: w.damage_modifier as number,
    damage_die: w.damage_die ?? null,
    damage_type: w.damage_type ?? null,
    properties: w.properties ?? null,
    weight: w.weight ?? null,
    is_ranged: w.is_ranged as boolean,
  };
}

