/* eslint-disable @typescript-eslint/naming-convention */
import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {FriendService} from '../../../services/friend.service';
import {
  FRIEND_REQUEST_COOLDOWN_DAYS,
  isUuid,
  resolvePaging,
  searchTerm,
  SOCIAL_MAX_PAGE_SIZE,
  toPagedList,
} from '../../../services/friend-rules';
import {
  FriendRepository,
  likeContains,
} from '../../../repositories/friend.repository';
import {UserBlockRepository} from '../../../repositories/user-block.repository';
import {FriendRequest, FriendRow} from '../../../models/friend-types';
import {NotificationService} from '../../../services/notification.service';
import {SocialEventsService} from '../../../services/social-events.service';
import {PresenceService} from '../../../services/presence.service';
import {SocialEvent} from '../../../models/social-event-types';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const REQ = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-11-03T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function request(overrides: Partial<FriendRequest> = {}): FriendRequest {
  return {
    id_friend_request: REQ,
    sender_id: OTHER,
    receiver_id: ME,
    status: 'pending',
    created_at: new Date(NOW),
    responded_at: null,
    ...overrides,
  };
}

describe('amigos — regras', () => {
  it('isUuid só aceita UUID', () => {
    expect(isUuid(ME)).to.be.true();
    expect(isUuid('abc')).to.be.false();
    expect(isUuid(`${ME}' OR 1=1`)).to.be.false();
    expect(isUuid(42)).to.be.false();
    expect(isUuid(undefined)).to.be.false();
  });

  it('paginação: padrão, mínimo e teto', () => {
    expect(resolvePaging()).to.eql({page: 1, pageSize: 20});
    expect(resolvePaging(0, -5)).to.eql({page: 1, pageSize: 20});
    expect(resolvePaging(3, 1000)).to.eql({
      page: 3,
      pageSize: SOCIAL_MAX_PAGE_SIZE,
    });
    expect(resolvePaging(2.5, 10)).to.eql({page: 1, pageSize: 10});
  });

  it('toPagedList tira o total_count de cada item', () => {
    expect(toPagedList([{id: 'a', total_count: '7'}], 1, 20)).to.eql({
      items: [{id: 'a'}],
      page: 1,
      pageSize: 20,
      total_count: 7,
    });
    expect(toPagedList([], 2, 20).total_count).to.equal(0);
  });

  it('termo da busca: mínimo 2, máximo 20, aparado', () => {
    expect(searchTerm('  go ')).to.equal('go');
    expect(() => searchTerm('g')).to.throw(/pelo menos 2/);
    expect(() => searchTerm(undefined)).to.throw(/pelo menos 2/);
    expect(() => searchTerm('a'.repeat(21))).to.throw(/no máximo 20/);
  });

  it('LIKE escapa curinga digitado pelo usuário', () => {
    expect(likeContains('Go_r%k\\')).to.equal('%go\\_r\\%k\\\\%');
  });
});

describe('FriendService', () => {
  let repository: StubbedInstanceWithSinonAccessor<FriendRepository>;
  let blocks: StubbedInstanceWithSinonAccessor<UserBlockRepository>;
  let notifications: StubbedInstanceWithSinonAccessor<NotificationService>;
  let presence: PresenceService;
  let events: SocialEvent[];
  let service: FriendService;

  function friendRow(overrides: Partial<FriendRow> = {}): FriendRow & {
    total_count: string;
  } {
    return {
      id: OTHER,
      username: 'gorak',
      friends_since: new Date(0),
      presence_visibility: 'friends',
      show_last_seen: false,
      last_access_at: new Date(1000),
      total_count: '1',
      ...overrides,
    };
  }

  function changed(scope: string): string[] {
    return events
      .filter(e => e.type === 'social_changed' && e.scope === scope)
      .map(e => e.user_id)
      .sort();
  }

  beforeEach(() => {
    repository = createStubInstance(FriendRepository);
    blocks = createStubInstance(UserBlockRepository);
    repository.stubs.findRecipient.callsFake(async id => ({
      id,
      username: id === ME ? 'aldric' : 'gorak',
      accept_friend_requests: true,
    }));
    blocks.stubs.blockStatus.resolves({byMe: false, byThem: false});
    repository.stubs.areFriends.resolves(false);
    repository.stubs.findPendingBetween.resolves(undefined);
    repository.stubs.lastRejectedAt.resolves(null);
    repository.stubs.createRequest.callsFake(async (sender, receiver) =>
      request({sender_id: sender, receiver_id: receiver}),
    );
    notifications = createStubInstance(NotificationService);
    notifications.stubs.notify.resolves();
    presence = new PresenceService();
    const bus = new SocialEventsService();
    events = [];
    bus.subscribe(e => events.push(e));
    service = new FriendService(
      repository,
      blocks,
      notifications,
      bus,
      presence,
    );
    service.now = () => NOW;
  });

  afterEach(() => sinon.restore());

  // -------------------------------------------------------------------------
  describe('enviar solicitação', () => {
    it('cria a solicitação pendente; o remetente vem do token', async () => {
      const result = await service.sendRequest(ME, {receiver_id: OTHER});
      expect(result.status).to.equal('pending');
      sinon.assert.calledOnceWithExactly(
        repository.stubs.createRequest,
        ME,
        OTHER,
      );
    });

    it('avisa o destinatário (notificação com trava de repetição) e atualiza as listas', async () => {
      await service.sendRequest(ME, {receiver_id: OTHER});
      sinon.assert.calledOnceWithExactly(notifications.stubs.notify, {
        user_id: OTHER,
        actor_id: ME,
        type: 'friend_request_received',
        payload: {id_friend_request: REQ},
        dedupe_key: `friend_request_received:${ME}:2026-11-03`,
      });
      expect(changed('requests')).to.eql([ME, OTHER].sort());
    });

    it('cancelar e reenviar: um aviso por dia, mesmo com solicitações diferentes', async () => {
      const keys = () =>
        notifications.stubs.notify.getCalls().map(c => c.args[0].dedupe_key);
      await service.sendRequest(ME, {receiver_id: OTHER});
      repository.stubs.createRequest.resolves(
        request({id_friend_request: 'outra', sender_id: ME}),
      );
      await service.sendRequest(ME, {receiver_id: OTHER});
      expect(new Set(keys()).size).to.equal(1);

      service.now = () => NOW + DAY;
      await service.sendRequest(ME, {receiver_id: OTHER});
      expect(new Set(keys()).size).to.equal(2);
    });

    it('solicitação barrada na validação não notifica ninguém', async () => {
      repository.stubs.areFriends.resolves(true);
      await expect(
        service.sendRequest(ME, {receiver_id: OTHER}),
      ).to.be.rejected();
      expect(notifications.stubs.notify.called).to.be.false();
      expect(events).to.be.empty();
    });

    it('não adiciona a si mesmo', async () => {
      await expect(
        service.sendRequest(ME, {receiver_id: ME}),
      ).to.be.rejectedWith({statusCode: 422});
      expect(repository.stubs.createRequest.called).to.be.false();
    });

    it('id inválido é 422 e não vai pro banco', async () => {
      await expect(
        service.sendRequest(ME, {receiver_id: 'abc'}),
      ).to.be.rejectedWith({statusCode: 422});
      await expect(service.sendRequest(ME, {} as never)).to.be.rejectedWith({
        statusCode: 422,
      });
      expect(repository.stubs.findRecipient.called).to.be.false();
    });

    it('quem pede precisa ter nome de usuário', async () => {
      repository.stubs.findRecipient.withArgs(ME).resolves({
        id: ME,
        username: null,
        accept_friend_requests: true,
      });
      await expect(
        service.sendRequest(ME, {receiver_id: OTHER}),
      ).to.be.rejectedWith({statusCode: 422});
    });

    it('jogador inexistente ou sem nome: 404', async () => {
      repository.stubs.findRecipient.withArgs(STRANGER).resolves(undefined);
      await expect(
        service.sendRequest(ME, {receiver_id: STRANGER}),
      ).to.be.rejectedWith({
        statusCode: 404,
        message: 'Jogador não encontrado',
      });
    });

    it('quem me bloqueou: mesmo 404 de jogador inexistente (não revela o bloqueio)', async () => {
      blocks.stubs.blockStatus.resolves({byMe: false, byThem: true});
      await expect(
        service.sendRequest(ME, {receiver_id: OTHER}),
      ).to.be.rejectedWith({
        statusCode: 404,
        message: 'Jogador não encontrado',
      });
      expect(repository.stubs.createRequest.called).to.be.false();
    });

    it('quem eu bloqueei: pede pra desbloquear antes', async () => {
      blocks.stubs.blockStatus.resolves({byMe: true, byThem: false});
      await expect(
        service.sendRequest(ME, {receiver_id: OTHER}),
      ).to.be.rejectedWith({statusCode: 422, message: /Desbloqueie/});
      expect(repository.stubs.createRequest.called).to.be.false();
    });

    it('já são amigos: 409', async () => {
      repository.stubs.areFriends.resolves(true);
      await expect(
        service.sendRequest(ME, {receiver_id: OTHER}),
      ).to.be.rejectedWith({statusCode: 409});
    });

    it('solicitação duplicada no mesmo sentido: 409', async () => {
      repository.stubs.findPendingBetween.resolves(
        request({sender_id: ME, receiver_id: OTHER}),
      );
      await expect(
        service.sendRequest(ME, {receiver_id: OTHER}),
      ).to.be.rejectedWith({
        statusCode: 409,
        message: 'Solicitação já enviada',
      });
      expect(repository.stubs.createRequest.called).to.be.false();
    });

    it('solicitação inversa pendente: aceita a existente em vez de criar outra', async () => {
      repository.stubs.findPendingBetween.resolves(request());
      const accepted = request({status: 'accepted'});
      repository.stubs.acceptRequest.resolves(accepted);
      const result = await service.sendRequest(ME, {receiver_id: OTHER});
      expect(result).to.eql({status: 'accepted', request: accepted});
      sinon.assert.calledOnceWithExactly(
        repository.stubs.acceptRequest,
        REQ,
        ME,
      );
      expect(repository.stubs.createRequest.called).to.be.false();
    });

    it('inversa pendente aceita mesmo se eu desliguei receber pedidos', async () => {
      repository.stubs.findRecipient.withArgs(OTHER).resolves({
        id: OTHER,
        username: 'gorak',
        accept_friend_requests: false,
      });
      repository.stubs.findPendingBetween.resolves(request());
      repository.stubs.acceptRequest.resolves(request({status: 'accepted'}));
      expect(
        (await service.sendRequest(ME, {receiver_id: OTHER})).status,
      ).to.equal('accepted');
    });

    it('destinatário que não aceita solicitações: 422', async () => {
      repository.stubs.findRecipient.withArgs(OTHER).resolves({
        id: OTHER,
        username: 'gorak',
        accept_friend_requests: false,
      });
      await expect(
        service.sendRequest(ME, {receiver_id: OTHER}),
      ).to.be.rejectedWith({statusCode: 422});
      expect(repository.stubs.createRequest.called).to.be.false();
    });

    it(`depois de recusada, espera ${FRIEND_REQUEST_COOLDOWN_DAYS} dias pra pedir de novo`, async () => {
      repository.stubs.lastRejectedAt.resolves(new Date(NOW - 5 * DAY));
      await expect(
        service.sendRequest(ME, {receiver_id: OTHER}),
      ).to.be.rejectedWith({statusCode: 422});
      expect(repository.stubs.createRequest.called).to.be.false();

      repository.stubs.lastRejectedAt.resolves(
        new Date(NOW - (FRIEND_REQUEST_COOLDOWN_DAYS + 1) * DAY),
      );
      expect(
        (await service.sendRequest(ME, {receiver_id: OTHER})).status,
      ).to.equal('pending');
    });

    it('corrida com outra pendente do par (índice único): 409', async () => {
      repository.stubs.createRequest.rejects(
        Object.assign(new Error('dup'), {code: '23505'}),
      );
      await expect(
        service.sendRequest(ME, {receiver_id: OTHER}),
      ).to.be.rejectedWith({statusCode: 409});
    });

    it('bloqueio que entrou entre a conferência e o INSERT: 404', async () => {
      repository.stubs.createRequest.resolves(undefined);
      await expect(
        service.sendRequest(ME, {receiver_id: OTHER}),
      ).to.be.rejectedWith({statusCode: 404});
    });
  });

  // -------------------------------------------------------------------------
  describe('responder solicitação', () => {
    beforeEach(() => {
      repository.stubs.findRequestById.resolves(request());
    });

    it('destinatário aceita', async () => {
      repository.stubs.acceptRequest.resolves(request({status: 'accepted'}));
      const result = await service.acceptRequest(REQ, ME);
      expect(result.status).to.equal('accepted');
      sinon.assert.calledOnceWithExactly(
        repository.stubs.acceptRequest,
        REQ,
        ME,
      );
    });

    it('aceitar avisa quem pediu e atualiza os amigos dos dois', async () => {
      repository.stubs.acceptRequest.resolves(request({status: 'accepted'}));
      await service.acceptRequest(REQ, ME);
      sinon.assert.calledOnceWithExactly(notifications.stubs.notify, {
        user_id: OTHER,
        actor_id: ME,
        type: 'friend_request_accepted',
        payload: {id_friend_request: REQ},
        dedupe_key: `friend_request_accepted:${REQ}`,
      });
      expect(changed('friends')).to.eql([ME, OTHER].sort());
    });

    it('recusar não avisa quem pediu', async () => {
      repository.stubs.closeRequest.resolves(request({status: 'rejected'}));
      await service.rejectRequest(REQ, ME);
      expect(notifications.stubs.notify.called).to.be.false();
      expect(events.map(e => e.user_id)).to.eql([ME]);
    });

    it('remetente não aceita a própria solicitação (404)', async () => {
      await expect(service.acceptRequest(REQ, OTHER)).to.be.rejectedWith({
        statusCode: 404,
      });
      expect(repository.stubs.acceptRequest.called).to.be.false();
    });

    it('terceiro não aceita nem recusa (404)', async () => {
      await expect(service.acceptRequest(REQ, STRANGER)).to.be.rejectedWith({
        statusCode: 404,
      });
      await expect(service.rejectRequest(REQ, STRANGER)).to.be.rejectedWith({
        statusCode: 404,
      });
      expect(repository.stubs.closeRequest.called).to.be.false();
    });

    it('já respondida: 409', async () => {
      repository.stubs.findRequestById.resolves(request({status: 'rejected'}));
      await expect(service.acceptRequest(REQ, ME)).to.be.rejectedWith({
        statusCode: 409,
      });
    });

    it('aceite barrado no banco (bloqueio no meio): 409', async () => {
      repository.stubs.acceptRequest.resolves(undefined);
      await expect(service.acceptRequest(REQ, ME)).to.be.rejectedWith({
        statusCode: 409,
      });
    });

    it('id malformado: 404 sem consultar o banco', async () => {
      await expect(service.acceptRequest('xyz', ME)).to.be.rejectedWith({
        statusCode: 404,
      });
      expect(repository.stubs.findRequestById.called).to.be.false();
    });

    it('destinatário recusa', async () => {
      repository.stubs.closeRequest.resolves(request({status: 'rejected'}));
      expect((await service.rejectRequest(REQ, ME)).status).to.equal(
        'rejected',
      );
      sinon.assert.calledOnceWithExactly(
        repository.stubs.closeRequest,
        REQ,
        ME,
        'receiver',
      );
    });

    it('remetente não recusa a própria (404)', async () => {
      await expect(service.rejectRequest(REQ, OTHER)).to.be.rejectedWith({
        statusCode: 404,
      });
    });

    it('remetente cancela a que enviou', async () => {
      repository.stubs.closeRequest.resolves(request({status: 'cancelled'}));
      expect((await service.cancelRequest(REQ, OTHER)).status).to.equal(
        'cancelled',
      );
      sinon.assert.calledOnceWithExactly(
        repository.stubs.closeRequest,
        REQ,
        OTHER,
        'sender',
      );
    });

    it('destinatário não cancela (404)', async () => {
      await expect(service.cancelRequest(REQ, ME)).to.be.rejectedWith({
        statusCode: 404,
      });
      expect(repository.stubs.closeRequest.called).to.be.false();
    });

    it('fechada por outra requisição no meio: 409', async () => {
      repository.stubs.closeRequest.resolves(undefined);
      await expect(service.cancelRequest(REQ, OTHER)).to.be.rejectedWith({
        statusCode: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('amizades', () => {
    it('remove a amizade (para os dois: uma linha só)', async () => {
      repository.stubs.removeFriendship.resolves(true);
      await service.removeFriend(ME, OTHER);
      sinon.assert.calledOnceWithExactly(
        repository.stubs.removeFriendship,
        ME,
        OTHER,
      );
    });

    it('remover quem não é amigo: 404', async () => {
      repository.stubs.removeFriendship.resolves(false);
      await expect(service.removeFriend(ME, OTHER)).to.be.rejectedWith({
        statusCode: 404,
      });
      await expect(service.removeFriend(ME, 'abc')).to.be.rejectedWith({
        statusCode: 404,
      });
    });

    it('lista paginada do próprio usuário, com filtro aparado e sem dados de privacidade', async () => {
      repository.stubs.findFriends.resolves([friendRow()]);
      const list = await service.listFriends(ME, '  gor ', 2, 10);
      sinon.assert.calledOnceWithExactly(
        repository.stubs.findFriends,
        ME,
        'gor',
        10,
        2,
        [],
      );
      expect(list).to.eql({
        items: [
          {
            id: OTHER,
            username: 'gorak',
            friends_since: new Date(0),
            presence: 'offline',
            availability: null,
            last_seen_at: null,
          },
        ],
        page: 2,
        pageSize: 10,
        total_count: 1,
      });
    });

    it('amigo conectado aparece com o status escolhido e a disponibilidade', async () => {
      presence.connect(OTHER, 's1');
      presence.setChoice(OTHER, {status: 'busy', availability: 'available'});
      repository.stubs.findFriends.resolves([friendRow()]);
      const [friend] = (await service.listFriends(ME)).items;
      expect(friend).to.containDeep({
        presence: 'busy',
        availability: 'available',
        last_seen_at: null,
      });
    });

    it('amigo que esconde a presença aparece offline mesmo conectado', async () => {
      presence.connect(OTHER, 's1');
      repository.stubs.findFriends.resolves([
        friendRow({presence_visibility: 'nobody', show_last_seen: true}),
      ]);
      const [friend] = (await service.listFriends(ME)).items;
      expect(friend).to.containDeep({presence: 'offline', last_seen_at: null});
    });

    it('última atividade só offline e só se o amigo permitir', async () => {
      repository.stubs.findFriends.resolves([
        friendRow({show_last_seen: true}),
      ]);
      const [friend] = (await service.listFriends(ME)).items;
      expect(friend.last_seen_at).to.eql(new Date(1000));
    });

    it('ninguém conectado: lista normal, sem ninguém pra adiantar', async () => {
      repository.stubs.findFriends.resolves([]);
      await service.listFriends(ME, undefined, 1, 10);
      sinon.assert.calledWith(
        repository.stubs.findFriends,
        ME,
        null,
        10,
        1,
        [],
      );
    });

    it('passa os conectados (sem o próprio usuário) pra virem primeiro', async () => {
      presence.connect(ME, 's0');
      presence.connect(OTHER, 's1');
      repository.stubs.findFriends.resolves([]);
      await service.listFriends(ME, undefined, 1, 10);
      sinon.assert.calledWith(repository.stubs.findFriends, ME, null, 10, 1, [
        OTHER,
      ]);
    });

    it('remover amizade avisa as listas dos dois', async () => {
      repository.stubs.removeFriendship.resolves(true);
      await service.removeFriend(ME, OTHER);
      expect(changed('friends')).to.eql([ME, OTHER].sort());
    });

    it('remover amizade atualiza os convites para mesa dos dois', async () => {
      repository.stubs.removeFriendship.resolves(true);
      await service.removeFriend(ME, OTHER);
      expect(changed('invites')).to.eql([ME, OTHER].sort());
    });

    it('remover quem não é amigo não mexe nos convites', async () => {
      repository.stubs.removeFriendship.resolves(false);
      await expect(service.removeFriend(ME, OTHER)).to.be.rejected();
      expect(changed('invites')).to.eql([]);
    });

    it('presença: avisa cada amigo com a privacidade aplicada', async () => {
      presence.connect(ME, 's0');
      repository.stubs.findPresenceAudience.resolves({
        friendIds: [OTHER, STRANGER],
        privacy: {
          presence_visibility: 'friends',
          show_last_seen: false,
          last_access_at: null,
        },
      });
      const updates = await service.presenceUpdatesFor(ME);
      expect(updates.map(u => u.user_id)).to.eql([OTHER, STRANGER]);
      expect(updates[0]).to.containDeep({
        type: 'presence_updated',
        friend: {id: ME, presence: 'online'},
      });
    });

    it('presença: quem esconde é avisado como offline', async () => {
      presence.connect(ME, 's0');
      repository.stubs.findPresenceAudience.resolves({
        friendIds: [OTHER],
        privacy: {
          presence_visibility: 'nobody',
          show_last_seen: true,
          last_access_at: new Date(5),
        },
      });
      const [update] = await service.presenceUpdatesFor(ME);
      expect(update).to.containDeep({
        friend: {presence: 'offline', last_seen_at: null},
      });
    });

    it('filtro vazio vira null', async () => {
      repository.stubs.findFriends.resolves([]);
      await service.listFriends(ME, '   ');
      sinon.assert.calledWith(repository.stubs.findFriends, ME, null, 20, 1);
    });
  });

  // -------------------------------------------------------------------------
  describe('busca de jogadores', () => {
    it('passa o usuário logado (pra excluir ele e quem o bloqueou) e pagina', async () => {
      repository.stubs.searchPlayers.resolves([]);
      await service.searchPlayers(ME, ' gorak ', 1, 100);
      sinon.assert.calledOnceWithExactly(
        repository.stubs.searchPlayers,
        ME,
        'gorak',
        SOCIAL_MAX_PAGE_SIZE,
        1,
      );
    });

    it('termo curto: 422 sem ir ao banco', async () => {
      await expect(service.searchPlayers(ME, 'g')).to.be.rejectedWith({
        statusCode: 422,
      });
      expect(repository.stubs.searchPlayers.called).to.be.false();
    });

    it('resultado não traz e-mail', async () => {
      repository.stubs.searchPlayers.resolves([
        {
          id: OTHER,
          username: 'gorak',
          relationship: 'none',
          id_friend_request: null,
          total_count: 1,
        },
      ]);
      const list = await service.searchPlayers(ME, 'gorak');
      expect(list.items[0]).to.not.have.property('email');
      expect(Object.keys(list.items[0]).sort()).to.eql([
        'id',
        'id_friend_request',
        'relationship',
        'username',
      ]);
    });
  });
});
