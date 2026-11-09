/* eslint-disable @typescript-eslint/naming-convention */
import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {NotificationService} from '../../../services/notification.service';
import {NotificationRepository} from '../../../repositories/notification.repository';
import {SocialEventsService} from '../../../services/social-events.service';
import {
  NotificationView,
  SocialEvent,
} from '../../../models/social-event-types';

const ME = '11111111-1111-4111-8111-111111111111';
const NOTE = '55555555-5555-4555-8555-555555555555';

function view(): NotificationView {
  return {
    id_notification: NOTE,
    type: 'friend_request_received',
    payload: {id_friend_request: 'r1'},
    actor: {id: 'u2', username: 'gorak'},
    pending_friend_request_id: null,
    read_at: null,
    created_at: new Date(0),
  };
}

const INPUT = {
  user_id: ME,
  actor_id: 'u2',
  type: 'friend_request_received' as const,
  payload: {id_friend_request: 'r1'},
  dedupe_key: 'friend_request_received:r1',
};

describe('NotificationService', () => {
  let repository: StubbedInstanceWithSinonAccessor<NotificationRepository>;
  let events: SocialEvent[];
  let service: NotificationService;

  beforeEach(() => {
    repository = createStubInstance(NotificationRepository);
    const bus = new SocialEventsService();
    events = [];
    bus.subscribe(e => events.push(e));
    service = new NotificationService(repository, bus);
  });

  afterEach(() => sinon.restore());

  it('grava e avisa em tempo real só o destinatário', async () => {
    repository.stubs.create.resolves(view());
    await service.notify(INPUT);
    sinon.assert.calledOnceWithExactly(repository.stubs.create, INPUT);
    expect(events).to.eql([
      {type: 'notification_created', user_id: ME, notification: view()},
    ]);
  });

  it('repetida (mesma dedupe_key, ex.: retry) não avisa de novo', async () => {
    repository.stubs.create.resolves(undefined);
    await service.notify(INPUT);
    expect(events).to.be.empty();
  });

  it('falha ao gravar não derruba a ação que notificou', async () => {
    const log = sinon.stub(console, 'error');
    repository.stubs.create.rejects(new Error('banco fora'));
    await service.notify(INPUT);
    expect(events).to.be.empty();
    sinon.assert.calledOnce(log);
    // O log não leva dado do usuário (ids, payload).
    expect(JSON.stringify(log.firstCall.args)).to.not.match(/11111111|r1/);
  });

  it('lista só as do usuário, paginada', async () => {
    repository.stubs.findForUser.resolves([{...view(), total_count: 3}]);
    const list = await service.list(ME, true, 1, 10);
    sinon.assert.calledOnceWithExactly(
      repository.stubs.findForUser,
      ME,
      true,
      10,
      1,
    );
    expect(list.total_count).to.equal(3);
    expect(list.items[0]).to.not.have.property('total_count');
  });

  it('contagem de não lidas', async () => {
    repository.stubs.countUnread.resolves(4);
    expect(await service.unreadCount(ME)).to.eql({count: 4});
  });

  it('marcar como lida: a de outra pessoa é 404', async () => {
    repository.stubs.markRead.resolves(false);
    await expect(service.markRead(NOTE, ME)).to.be.rejectedWith({
      statusCode: 404,
    });
    sinon.assert.calledOnceWithExactly(repository.stubs.markRead, NOTE, ME);
  });

  it('marcar como lida: id inválido é 404 sem ir ao banco', async () => {
    await expect(service.markRead('abc', ME)).to.be.rejectedWith({
      statusCode: 404,
    });
    expect(repository.stubs.markRead.called).to.be.false();
  });

  it('marcar todas', async () => {
    repository.stubs.markAllRead.resolves(2);
    expect(await service.markAllRead(ME)).to.eql({updated: 2});
  });
});
