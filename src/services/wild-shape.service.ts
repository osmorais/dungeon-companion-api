/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {MonsterRepository} from '../repositories/monster.repository';
import {GameSessionRepository} from '../repositories/game-session.repository';
import {SessionEventsService} from './session-events.service';
import {CharacterSheetService} from './character-sheet.service';
import {ActiveEffects} from './character-sheet/combat-features';
import {
  beastAllowed,
  WildShapeLimits,
  wildShapeLimits,
} from './character-sheet/wild-shape';

export interface WildShapeOption {
  slug: string;
  name: string;
  challenge_rating: number;
  hp_max: number;
  ac: number;
  speed: Record<string, string>;
}

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

/**
 * Forma Selvagem (druida): as bestas do bestiário que cabem no nível, transformar e voltar. As
 * regras (ND, nado, voo, usos) ficam em `wild-shape.ts` e no CharacterSheetService.
 */
@injectable({scope: BindingScope.TRANSIENT})
export class WildShapeService {
  constructor(
    @service(MonsterRepository)
    private monsters: MonsterRepository,
    // Registrado à mão no application.ts (dois bindings) — ver "Injeção de dependência" no CLAUDE.md.
    @inject('services.CharacterSheetService')
    private sheets: CharacterSheetService,
    @service(GameSessionRepository)
    private sessions: GameSessionRepository,
    @service(SessionEventsService)
    private events: SessionEventsService,
  ) {}

  async options(
    id: number,
    userId: string,
  ): Promise<{limits: WildShapeLimits | null; beasts: WildShapeOption[]}> {
    const ctx = await this.sheets.wildShapeContext(id, userId);
    const limits = wildShapeLimits(ctx.idClass, ctx.idSubclass, ctx.level);
    if (!limits) return {limits: null, beasts: []};
    const beasts = (await this.monsters.listBeasts())
      .filter(beast => beastAllowed(beast, limits))
      .map(beast => ({
        slug: beast.slug,
        name: beast.name,
        challenge_rating: beast.challenge_rating,
        hp_max: beast.hp_max,
        ac: beast.ac,
        speed: (beast.data['speed'] as Record<string, string>) ?? {},
      }));
    return {limits, beasts};
  }

  async start(
    id: number,
    slug: unknown,
    userId: string,
  ): Promise<{active_effects: ActiveEffects}> {
    if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug))
      throw new HttpErrors.UnprocessableEntity('Besta inválida');
    const beast = await this.monsters.findBeast(slug);
    if (!beast)
      throw new HttpErrors.NotFound('Besta não encontrada no bestiário');
    const result = await this.sheets.setWildShape(id, userId, beast);
    await this.announce(id, result.active_effects);
    return result;
  }

  async end(
    id: number,
    userId: string,
  ): Promise<{active_effects: ActiveEffects}> {
    const result = await this.sheets.setWildShape(id, userId, null);
    await this.announce(id, result.active_effects);
    return result;
  }

  /** As mesas em que o druida joga passam a mostrar (ou deixam de mostrar) o PV da forma. */
  private async announce(id: number, effects: ActiveEffects): Promise<void> {
    const form = effects.wild_shape ?? null;
    for (const row of await this.sessions.findPlayerSessionsOfCharacter(id)) {
      this.events.publish({
        type: 'player_hp_updated',
        id_game_session: row.id_game_session,
        id_player_session: row.id_player_session,
        current_hit_points: form ? form.hp_current : row.current_hit_points,
        temporary_hit_points: row.temporary_hit_points,
        max_hit_points: form ? form.hp_max : row.max_hit_points,
        wild_shape_name: form ? form.name : null,
      });
    }
  }
}
