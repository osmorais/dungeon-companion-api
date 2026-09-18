import {inject, service} from '@loopback/core';
import {param, post, requestBody, response} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {CombatService} from '../services/combat.service';
import {
  CombatEncounterDetail,
  MoveParticipantInput,
  StartEncounterParticipantInput,
  SubmitInitiativeInput,
} from '../models/combat-types';

@authenticate('jwt')
export class CombatController {
  constructor(
    @service(CombatService)
    private combatService: CombatService,
  ) {}

  @post('/api/game-session/{id}/combat/start')
  @response(201, {
    description: 'Starts a combat encounter for the given game session',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async startEncounter(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'Participants selected for the encounter',
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    body: {participants: StartEncounterParticipantInput[]},
  ): Promise<CombatEncounterDetail> {
    return this.combatService.startEncounter(
      id,
      body.participants,
      currentUser.id,
    );
  }

  @post('/api/game-session/combat-participant/{id}/initiative')
  @response(204, {description: 'Initiative roll registered'})
  async submitInitiative(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'Initiative roll result',
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    body: SubmitInitiativeInput,
  ): Promise<void> {
    return this.combatService.submitInitiative(id, body, currentUser.id);
  }

  @post('/api/game-session/combat/{id}/end-turn')
  @response(204, {
    description: 'Current turn ended, advances to the next participant',
  })
  async endTurn(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<void> {
    return this.combatService.endTurn(id, currentUser.id);
  }

  @post('/api/game-session/combat/{id}/end')
  @response(204, {description: 'Combat encounter finished'})
  async endEncounter(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<void> {
    return this.combatService.endEncounter(id, currentUser.id);
  }

  @post('/api/game-session/combat/{id}/move-participant')
  @response(204, {
    description:
      'Moves a participant one position up/down in the initiative order',
  })
  async moveParticipant(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'Participant to move and direction',
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    body: MoveParticipantInput,
  ): Promise<void> {
    return this.combatService.moveParticipant(
      id,
      body.id_combat_participant,
      body.direction,
      currentUser.id,
    );
  }

  @post('/api/game-session/combat/{id}/delay-turn')
  @response(204, {
    description: 'Delays the current turn to the end of the current round',
  })
  async delayTurn(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<void> {
    return this.combatService.delayTurn(id, currentUser.id);
  }
}
