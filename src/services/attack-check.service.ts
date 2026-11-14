/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {GameSessionRepository} from '../repositories/game-session.repository';
import {SessionEventsService} from './session-events.service';
import {CharacterSheetService} from './character-sheet.service';

export type AttackTargetKind = 'player' | 'npc' | 'monster' | 'companion';

/**
 * Acerto automático do ataque (1.25.0): com a opção da mesa ligada (`game_session.auto_hit_check`,
 * no Quadro do Mestre), a API compara o total do ataque com a CA do alvo e diz só se acertou —
 * a CA do monstro nunca vai pro jogador. 20 natural sempre acerta; 1 natural sempre erra.
 */
export function attackHits(
  total: number,
  natural: number,
  armorClass: number,
): boolean {
  if (natural === 20) return true;
  if (natural === 1) return false;
  return total >= armorClass;
}

@injectable({scope: BindingScope.TRANSIENT})
export class AttackCheckService {
  constructor(
    @service(GameSessionRepository)
    private sessions: GameSessionRepository,
    // Registrado à mão no application.ts (dois bindings) — ver "Injeção de dependência" no CLAUDE.md.
    @inject('services.CharacterSheetService')
    private sheets: CharacterSheetService,
    @service(SessionEventsService)
    private events: SessionEventsService,
  ) {}

  /** Mestre liga/desliga o acerto automático da mesa; a mesa recebe a opção nova. */
  async setAutoHitCheck(
    idGameSession: string,
    value: unknown,
    userId: string,
  ): Promise<{auto_hit_check: boolean}> {
    if (typeof value !== 'boolean')
      throw new HttpErrors.UnprocessableEntity(
        'auto_hit_check deve ser true ou false',
      );
    if (!(await this.sessions.isSessionOwner(idGameSession, userId)))
      throw new HttpErrors.Forbidden('Só o mestre muda as opções da mesa');
    await this.sessions.setAutoHitCheck(idGameSession, value);
    this.events.publish({
      type: 'session_settings_updated',
      id_game_session: idGameSession,
      auto_hit_check: value,
    });
    return {auto_hit_check: value};
  }

  /** Acertou o alvo? Só com a opção da mesa ligada; o jogador só mira monstro revelado. */
  async check(
    idGameSession: string,
    input: {
      target_kind?: unknown;
      target_id?: unknown;
      total?: unknown;
      natural?: unknown;
    },
    userId: string,
  ): Promise<{hit: boolean}> {
    const kind = input?.target_kind;
    const id = input?.target_id;
    const total = input?.total;
    const natural = input?.natural;
    if (
      !['player', 'npc', 'monster', 'companion'].includes(kind as string) ||
      typeof id !== 'string'
    )
      throw new HttpErrors.UnprocessableEntity('Alvo inválido');
    if (
      !Number.isInteger(total) ||
      !Number.isInteger(natural) ||
      (natural as number) < 1 ||
      (natural as number) > 20
    )
      throw new HttpErrors.UnprocessableEntity('Rolagem inválida');
    if (!(await this.sessions.hasSessionAccess(idGameSession, userId)))
      throw new HttpErrors.Forbidden('Você não tem acesso a esta sessão');
    const detail = await this.sessions.findById(idGameSession);
    if (!detail) throw new HttpErrors.NotFound('Sessão não encontrada');
    if (!detail.game_session.auto_hit_check)
      throw new HttpErrors.UnprocessableEntity(
        'A mesa não usa acerto automático',
      );
    const isDm = detail.game_session.user_id === userId;
    const ac = await this.armorClassOf(
      detail,
      kind as AttackTargetKind,
      id,
      isDm,
    );
    return {hit: attackHits(total as number, natural as number, ac)};
  }

  private async armorClassOf(
    detail: NonNullable<Awaited<ReturnType<GameSessionRepository['findById']>>>,
    kind: AttackTargetKind,
    id: string,
    isDm: boolean,
  ): Promise<number> {
    const notFound = () =>
      new HttpErrors.NotFound('Alvo não encontrado na sessão');
    if (kind === 'monster') {
      const monster = detail.monsters.find(m => m.id_monster_session === id);
      if (!monster || (!isDm && !monster.is_revealed)) throw notFound();
      return monster.ac;
    }
    if (kind === 'companion') {
      const companion = (detail.companions ?? []).find(
        c => c.id_session_companion === id,
      );
      if (!companion) throw notFound();
      return companion.armor_class;
    }
    // Jogador/NPC: a CA da ficha calculada (armadura, escudo, Defesa sem Armadura…), lida como o
    // dono do personagem (o mestre é o dono do NPC na mesa).
    const owner =
      kind === 'player'
        ? detail.players.find(p => p.id_player_session === id)
        : detail.npcs.find(n => n.id_npc_session === id);
    if (!owner) throw notFound();
    const ownerUser =
      kind === 'player'
        ? (owner as {user_id: string}).user_id
        : (detail.game_session.user_id as string);
    const sheet = await this.sheets.loadCharacter(
      owner.id_character,
      ownerUser,
    );
    if (!sheet) throw notFound();
    return sheet.character_sheet.combat_stats.armor_class;
  }
}
