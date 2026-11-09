/* eslint-disable @typescript-eslint/naming-convention */
import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {HttpErrors} from '@loopback/rest';
import {
  normalizeMessage,
  SESSION_INVITE_TTL_DAYS,
  SessionInviteService,
} from '../../../services/session-invite.service';
import {SessionInviteRepository} from '../../../repositories/session-invite.repository';
import {FriendRepository} from '../../../repositories/friend.repository';
import {UserBlockRepository} from '../../../repositories/user-block.repository';
import {GameSessionService} from '../../../services/game-session.service';
import {NotificationService} from '../../../services/notification.service';
import {SocialEventsService} from '../../../services/social-events.service';
import {SocialEvent} from '../../../models/social-event-types';
import {
  InviteTargetSession,
  SessionInvite,
} from '../../../models/session-invite-types';
import {PlayerSession} from '../../../models/game-session-types';

const DM = '11111111-1111-4111-8111-111111111111';
const FRIEND = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const INV = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-11-03T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function target(
  overrides: Partial<InviteTargetSession> = {},
): InviteTargetSession {
  return {
    id_game_session: SESSION,
    session_name: 'A Mina Perdida',
    session_code: 'ABCDE',
    user_id: DM,
    max_player_quantity: 4,
    player_count: 1,
    ...overrides,
  };
}

function invite(overrides: Partial<SessionInvite> = {}): SessionInvite {
  return {
    id_session_invite: INV,
    id_game_session: SESSION,
    sender_id: DM,
    receiver_id: FRIEND,
    status: 'pending',
    message: null,
    created_at: new Date(NOW),
    expires_at: new Date(NOW + DAY),
    responded_at: null,
    ...overrides,
  };
}

describe('SessionInviteService', () => {
  let repository: StubbedInstanceWithSinonAccessor<SessionInviteRepository>;
  let friends: StubbedInstanceWithSinonAccessor<FriendRepository>;
  let blocks: StubbedInstanceWithSinonAccessor<UserBlockRepository>;
  let gameSessions: StubbedInstanceWithSinonAccessor<GameSessionService>;
  let notifications: StubbedInstanceWithSinonAccessor<NotificationService>;
  let events: SocialEvent[];
  let service: SessionInviteService;

  beforeEach(() => {
    repository = createStubInstance(SessionInviteRepository);
    friends = createStubInstance(FriendRepository);
    blocks = createStubInstance(UserBlockRepository);
    gameSessions = createStubInstance(GameSessionService);
    notifications = createStubInstance(NotificationService);
    repository.stubs.findTargetSession.resolves(target());
    repository.stubs.isInSession.resolves(false);
    repository.stubs.create.callsFake(async input =>
      invite({
        message: input.message,
        expires_at: input.expires_at,
      }),
    );
    repository.stubs.findById.resolves(invite());
    repository.stubs.claim.resolves(invite({status: 'accepted'}));
    blocks.stubs.blockStatus.resolves({byMe: false, byThem: false});
    friends.stubs.areFriends.resolves(true);
    gameSessions.stubs.addPlayer.resolves({
      id_player_session: 'ps1',
    } as PlayerSession);
    notifications.stubs.notify.resolves();
    const bus = new SocialEventsService();
    events = [];
    bus.subscribe(e => events.push(e));
    service = new SessionInviteService(
      repository,
      friends,
      blocks,
      gameSessions,
      notifications,
      bus,
    );
    service.now = () => NOW;
  });

  afterEach(() => sinon.restore());

  // -------------------------------------------------------------------------
  describe('convidar', () => {
    const input = {id_game_session: SESSION, receiver_id: FRIEND};

    it('mestre convida um amigo; expira em 7 dias e avisa o convidado', async () => {
      const result = await service.send(DM, {...input, message: '  Bora? '});
      sinon.assert.calledOnce(repository.stubs.create);
      const created = repository.stubs.create.firstCall.args[0];
      expect(created).to.containDeep({
        id_game_session: SESSION,
        sender_id: DM,
        receiver_id: FRIEND,
        message: 'Bora?',
      });
      expect(created.expires_at.getTime()).to.equal(
        NOW + SESSION_INVITE_TTL_DAYS * DAY,
      );
      expect(result.message).to.equal('Bora?');
      sinon.assert.calledOnceWithExactly(notifications.stubs.notify, {
        user_id: FRIEND,
        actor_id: DM,
        type: 'session_invite_received',
        payload: {id_session_invite: INV, id_game_session: SESSION},
        dedupe_key: `session_invite_received:${INV}`,
      });
      expect(events.map(e => e.user_id).sort()).to.eql([DM, FRIEND].sort());
    });

    it('vencidos do convidado são marcados antes (não travam um convite novo)', async () => {
      await service.send(DM, input);
      sinon.assert.callOrder(
        repository.stubs.expireStale,
        repository.stubs.create,
      );
      sinon.assert.calledWith(repository.stubs.expireStale, FRIEND);
    });

    it('jogador (não mestre) não convida: 403', async () => {
      repository.stubs.findTargetSession.resolves(target({user_id: STRANGER}));
      await expect(service.send(DM, input)).to.be.rejectedWith({
        statusCode: 403,
      });
      expect(repository.stubs.create.called).to.be.false();
    });

    it('mesa inexistente: 404', async () => {
      repository.stubs.findTargetSession.resolves(undefined);
      await expect(service.send(DM, input)).to.be.rejectedWith({
        statusCode: 404,
      });
    });

    it('só amigos', async () => {
      friends.stubs.areFriends.resolves(false);
      await expect(service.send(DM, input)).to.be.rejectedWith({
        statusCode: 422,
        message: /amigos/,
      });
    });

    it('quem bloqueou o mestre: mesma resposta de quem não é amigo (não revela o bloqueio)', async () => {
      blocks.stubs.blockStatus.resolves({byMe: false, byThem: true});
      friends.stubs.areFriends.resolves(true);
      await expect(service.send(DM, input)).to.be.rejectedWith({
        statusCode: 422,
        message: 'Só é possível convidar amigos',
      });
      expect(repository.stubs.create.called).to.be.false();
    });

    it('quem o mestre bloqueou: pede pra desbloquear', async () => {
      blocks.stubs.blockStatus.resolves({byMe: true, byThem: false});
      await expect(service.send(DM, input)).to.be.rejectedWith({
        statusCode: 422,
      });
    });

    it('já está na mesa: 409', async () => {
      repository.stubs.isInSession.resolves(true);
      await expect(service.send(DM, input)).to.be.rejectedWith({
        statusCode: 409,
      });
    });

    it('mesa cheia: 422', async () => {
      repository.stubs.findTargetSession.resolves(
        target({player_count: 4, max_player_quantity: 4}),
      );
      await expect(service.send(DM, input)).to.be.rejectedWith({
        statusCode: 422,
        message: /cheia/,
      });
    });

    it('convite pendente duplicado (índice único): 409', async () => {
      repository.stubs.create.rejects(
        Object.assign(new Error('dup'), {code: '23505'}),
      );
      await expect(service.send(DM, input)).to.be.rejectedWith({
        statusCode: 409,
      });
      expect(notifications.stubs.notify.called).to.be.false();
    });

    it('ids inválidos e convite pra si mesmo: 422 sem ir ao banco', async () => {
      await expect(
        service.send(DM, {id_game_session: 'x', receiver_id: FRIEND}),
      ).to.be.rejectedWith({statusCode: 422});
      await expect(
        service.send(DM, {id_game_session: SESSION, receiver_id: DM}),
      ).to.be.rejectedWith({statusCode: 422});
      expect(repository.stubs.findTargetSession.called).to.be.false();
    });
  });

  it('recado: aparado, vazio vira null, limite de 200', () => {
    expect(normalizeMessage(undefined)).to.be.null();
    expect(normalizeMessage('   ')).to.be.null();
    expect(normalizeMessage(' oi ')).to.equal('oi');
    expect(() => normalizeMessage('a'.repeat(201))).to.throw(/200/);
    expect(() => normalizeMessage(42)).to.throw(/inválida/);
  });

  // -------------------------------------------------------------------------
  describe('aceitar', () => {
    it('entra pelo fluxo normal da mesa (código + personagem) e avisa o mestre', async () => {
      const result = await service.accept(INV, FRIEND, {id_character: 7});
      sinon.assert.calledOnceWithExactly(
        gameSessions.stubs.addPlayer,
        {session_code: 'ABCDE', id_character: 7},
        FRIEND,
      );
      sinon.assert.callOrder(
        repository.stubs.claim,
        gameSessions.stubs.addPlayer,
      );
      expect(result.id_game_session).to.equal(SESSION);
      sinon.assert.calledWithMatch(notifications.stubs.notify, {
        user_id: DM,
        type: 'session_invite_accepted',
      });
    });

    it('sem personagem válido: 422', async () => {
      await expect(
        service.accept(INV, FRIEND, {id_character: 0}),
      ).to.be.rejectedWith({statusCode: 422});
      await expect(service.accept(INV, FRIEND, {} as never)).to.be.rejectedWith(
        {statusCode: 422},
      );
      expect(repository.stubs.claim.called).to.be.false();
    });

    it('só o convidado aceita: mestre e terceiro levam 404', async () => {
      await expect(
        service.accept(INV, DM, {id_character: 7}),
      ).to.be.rejectedWith({statusCode: 404});
      await expect(
        service.accept(INV, STRANGER, {id_character: 7}),
      ).to.be.rejectedWith({statusCode: 404});
      expect(gameSessions.stubs.addPlayer.called).to.be.false();
    });

    it('convite já respondido: 409', async () => {
      repository.stubs.findById.resolves(invite({status: 'rejected'}));
      await expect(
        service.accept(INV, FRIEND, {id_character: 7}),
      ).to.be.rejectedWith({statusCode: 409});
    });

    it('convite expirado não é aceito (e é marcado como expirado)', async () => {
      repository.stubs.findById.resolves(
        invite({expires_at: new Date(NOW - 1)}),
      );
      await expect(
        service.accept(INV, FRIEND, {id_character: 7}),
      ).to.be.rejectedWith({statusCode: 422, message: /expirou/});
      sinon.assert.calledWith(repository.stubs.close, INV, 'expired');
      expect(gameSessions.stubs.addPlayer.called).to.be.false();
    });

    it('quem convidou deixou de ser o mestre: convite não vale mais', async () => {
      repository.stubs.findTargetSession.resolves(target({user_id: STRANGER}));
      await expect(
        service.accept(INV, FRIEND, {id_character: 7}),
      ).to.be.rejectedWith({statusCode: 409});
      sinon.assert.calledWith(repository.stubs.close, INV, 'cancelled');
    });

    it('mesa apagada: 404', async () => {
      repository.stubs.findTargetSession.resolves(undefined);
      await expect(
        service.accept(INV, FRIEND, {id_character: 7}),
      ).to.be.rejectedWith({statusCode: 404});
    });

    it('bloqueio entre os dois: 404', async () => {
      blocks.stubs.blockStatus.resolves({byMe: true, byThem: false});
      await expect(
        service.accept(INV, FRIEND, {id_character: 7}),
      ).to.be.rejectedWith({statusCode: 404});
      expect(repository.stubs.claim.called).to.be.false();
    });

    it('corrida (cancelado/aceito em outra aba): 409', async () => {
      repository.stubs.claim.resolves(undefined);
      await expect(
        service.accept(INV, FRIEND, {id_character: 7}),
      ).to.be.rejectedWith({statusCode: 409});
      expect(gameSessions.stubs.addPlayer.called).to.be.false();
    });

    it('entrada recusada pela mesa (sem vaga): o convite volta a valer e o erro passa', async () => {
      gameSessions.stubs.addPlayer.rejects(
        new HttpErrors.UnprocessableEntity(
          'A sessão já atingiu o número máximo de jogadores',
        ),
      );
      await expect(
        service.accept(INV, FRIEND, {id_character: 7}),
      ).to.be.rejectedWith({statusCode: 422, message: /máximo/});
      sinon.assert.calledOnceWithExactly(repository.stubs.releaseClaim, INV);
      expect(notifications.stubs.notify.called).to.be.false();
    });
  });

  // -------------------------------------------------------------------------
  describe('recusar e cancelar', () => {
    it('convidado recusa e o mestre é avisado', async () => {
      repository.stubs.close.resolves(invite({status: 'rejected'}));
      await service.reject(INV, FRIEND);
      sinon.assert.calledWith(repository.stubs.close, INV, 'rejected', {
        userId: FRIEND,
        as: 'receiver',
      });
      sinon.assert.calledWithMatch(notifications.stubs.notify, {
        user_id: DM,
        type: 'session_invite_rejected',
      });
    });

    it('mestre não recusa pelo convidado (404)', async () => {
      await expect(service.reject(INV, DM)).to.be.rejectedWith({
        statusCode: 404,
      });
    });

    it('mestre cancela o que enviou; convidado não cancela (404)', async () => {
      repository.stubs.close.resolves(invite({status: 'cancelled'}));
      await service.cancel(INV, DM);
      sinon.assert.calledWith(repository.stubs.close, INV, 'cancelled', {
        userId: DM,
        as: 'sender',
      });
      expect(events.map(e => e.user_id).sort()).to.eql([DM, FRIEND].sort());
      await expect(service.cancel(INV, FRIEND)).to.be.rejectedWith({
        statusCode: 404,
      });
    });

    it('fechado em outra requisição no meio: 409', async () => {
      repository.stubs.close.resolves(undefined);
      await expect(service.cancel(INV, DM)).to.be.rejectedWith({
        statusCode: 409,
      });
    });
  });

  it('listar marca os vencidos antes e pagina', async () => {
    repository.stubs.findPending.resolves([]);
    await service.list(FRIEND, 'received', 1, 10);
    sinon.assert.callOrder(
      repository.stubs.expireStale,
      repository.stubs.findPending,
    );
    sinon.assert.calledWith(
      repository.stubs.findPending,
      FRIEND,
      'received',
      10,
      1,
    );
  });
});
