/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {CompanionRepository} from '../repositories/companion.repository';
import {MonsterRepository} from '../repositories/monster.repository';
import {SessionEventsService} from './session-events.service';
import {
  canHaveCompanion,
  companionBeastAllowed,
  companionMaxHp,
  pickCompanionColor,
  SessionCompanion,
} from './character-sheet/companion';

export interface CompanionOption {
  slug: string;
  name: string;
  challenge_rating: number;
  hp_max: number;
  ac: number;
  speed: Record<string, string>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

/**
 * Companheiro Animal (ranger do Conclave da Besta, nível 3+): uma besta de ND 1/4 ou menor, até
 * Médio, por vaga na mesa. Quem mexe: o jogador do ranger e o mestre. A mesa toda vê.
 */
@injectable({scope: BindingScope.TRANSIENT})
export class CompanionService {
  constructor(
    @service(CompanionRepository)
    private companions: CompanionRepository,
    @service(MonsterRepository)
    private monsters: MonsterRepository,
    @service(SessionEventsService)
    private events: SessionEventsService,
  ) {}

  private async ranger(
    idGameSession: string,
    idPlayerSession: unknown,
    userId: string,
  ) {
    if (
      typeof idPlayerSession !== 'string' ||
      !UUID_PATTERN.test(idPlayerSession)
    )
      throw new HttpErrors.UnprocessableEntity('Jogador inválido');
    const ranger = await this.companions.findRanger(
      idGameSession,
      idPlayerSession,
    );
    if (!ranger)
      throw new HttpErrors.NotFound('Jogador não encontrado na sessão');
    if (ranger.player_user_id !== userId && ranger.session_owner_id !== userId)
      throw new HttpErrors.Forbidden('Só o jogador do ranger ou o mestre');
    return {...ranger, idPlayerSession};
  }

  async options(
    idGameSession: string,
    idPlayerSession: unknown,
    userId: string,
  ): Promise<{allowed: boolean; beasts: CompanionOption[]}> {
    const ranger = await this.ranger(idGameSession, idPlayerSession, userId);
    if (
      !canHaveCompanion(
        ranger.id_class ?? 0,
        ranger.id_subclass,
        ranger.level ?? 0,
      )
    )
      return {allowed: false, beasts: []};
    const beasts = (await this.monsters.listBeasts())
      .filter(companionBeastAllowed)
      .map(beast => ({
        slug: beast.slug,
        name: beast.name,
        challenge_rating: beast.challenge_rating,
        hp_max: beast.hp_max,
        ac: beast.ac,
        speed: (beast.data['speed'] as Record<string, string>) ?? {},
      }));
    return {allowed: true, beasts};
  }

  /** Escolhe (ou troca) o companheiro do ranger: PV cheio, cor sorteada na primeira vez. */
  async choose(
    idGameSession: string,
    input: {id_player_session?: unknown; slug?: unknown},
    userId: string,
  ): Promise<SessionCompanion> {
    const ranger = await this.ranger(
      idGameSession,
      input?.id_player_session,
      userId,
    );
    if (
      !canHaveCompanion(
        ranger.id_class ?? 0,
        ranger.id_subclass,
        ranger.level ?? 0,
      )
    )
      throw new HttpErrors.UnprocessableEntity(
        'Só ranger do Conclave da Besta a partir do nível 3 tem companheiro',
      );
    if (typeof input.slug !== 'string' || !SLUG_PATTERN.test(input.slug))
      throw new HttpErrors.UnprocessableEntity('Besta inválida');
    const beast = await this.monsters.findBeast(input.slug);
    if (!beast)
      throw new HttpErrors.NotFound('Besta não encontrada no bestiário');
    if (!companionBeastAllowed(beast))
      throw new HttpErrors.UnprocessableEntity(
        'O companheiro é uma besta de ND 1/4 ou menor, de tamanho até Médio',
      );
    const color = pickCompanionColor(
      await this.companions.usedColors(idGameSession, ranger.idPlayerSession),
    );
    const id = await this.companions.upsert({
      idGameSession,
      idPlayerSession: ranger.idPlayerSession,
      slug: beast.slug,
      name: beast.name,
      hpCurrent: companionMaxHp(beast.hp_max, ranger.level ?? 1),
      data: beast.data,
      color,
    });
    const companion = await this.companions.findById(id);
    if (!companion) throw new HttpErrors.NotFound('Companheiro não encontrado');
    this.events.publish({
      type: 'companion_set',
      id_game_session: idGameSession,
      id_player_session: ranger.idPlayerSession,
      companion,
    });
    return companion;
  }

  async dismiss(id: string, userId: string): Promise<void> {
    const companion = await this.owned(id, userId);
    await this.companions.delete(id);
    this.events.publish({
      type: 'companion_set',
      id_game_session: companion.id_game_session,
      id_player_session: companion.id_player_session,
      companion: null,
    });
  }

  /** Ajuste direto do PV (cartão do companheiro), de 0 até o máximo. */
  async setHp(
    id: string,
    hp: unknown,
    userId: string,
  ): Promise<{hp_current: number}> {
    if (typeof hp !== 'number' || !Number.isInteger(hp) || hp < 0)
      throw new HttpErrors.UnprocessableEntity('PV inválido');
    const companion = await this.owned(id, userId);
    const value = Math.min(hp, companion.hp_max);
    await this.companions.writeHp(id, value);
    this.events.publish({
      type: 'companion_hp_updated',
      id_game_session: companion.id_game_session,
      id_session_companion: id,
      hp_current: value,
    });
    return {hp_current: value};
  }

  private async owned(id: string, userId: string): Promise<SessionCompanion> {
    if (!UUID_PATTERN.test(id))
      throw new HttpErrors.NotFound('Companheiro não encontrado');
    const owners = await this.companions.findOwners(id);
    const companion = owners ? await this.companions.findById(id) : null;
    if (!owners || !companion)
      throw new HttpErrors.NotFound('Companheiro não encontrado');
    if (owners.player_user_id !== userId && owners.session_owner_id !== userId)
      throw new HttpErrors.Forbidden('Só o jogador do ranger ou o mestre');
    return companion;
  }
}
