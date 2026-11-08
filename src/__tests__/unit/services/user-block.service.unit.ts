/* eslint-disable @typescript-eslint/naming-convention */
import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {UserBlockService} from '../../../services/user-block.service';
import {UserBlockRepository} from '../../../repositories/user-block.repository';
import {UserRepository} from '../../../repositories/user.repository';
import {SocialEventsService} from '../../../services/social-events.service';
import {SocialEvent} from '../../../models/social-event-types';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('UserBlockService', () => {
  let repository: StubbedInstanceWithSinonAccessor<UserBlockRepository>;
  let users: StubbedInstanceWithSinonAccessor<UserRepository>;
  let service: UserBlockService;
  let events: SocialEvent[];

  beforeEach(() => {
    repository = createStubInstance(UserBlockRepository);
    users = createStubInstance(UserRepository);
    users.stubs.findById.resolves({id: OTHER, email: 'x@y.z'});
    repository.stubs.block.resolves({friendshipRemoved: true});
    const bus = new SocialEventsService();
    events = [];
    bus.subscribe(e => events.push(e));
    service = new UserBlockService(repository, users, bus);
  });

  afterEach(() => sinon.restore());

  it('bloqueia (o repositório desfaz amizade e solicitações na mesma transação)', async () => {
    const result = await service.block(ME, OTHER);
    expect(result).to.eql({friendshipRemoved: true});
    sinon.assert.calledOnceWithExactly(repository.stubs.block, ME, OTHER);
  });

  it('o bloqueado só recebe o recarregar genérico, sem o escopo de bloqueados', async () => {
    await service.block(ME, OTHER);
    expect(events.filter(e => e.user_id === ME)).to.have.length(4);
    const toOther = events.filter(e => e.user_id === OTHER);
    expect(toOther.map(e => e.type === 'social_changed' && e.scope)).to.eql([
      'friends',
      'requests',
      'invites',
    ]);
  });

  it('não bloqueia a si mesmo', async () => {
    await expect(service.block(ME, ME)).to.be.rejectedWith({statusCode: 422});
    expect(repository.stubs.block.called).to.be.false();
  });

  it('jogador inexistente ou id inválido: 404', async () => {
    users.stubs.findById.resolves(undefined);
    await expect(service.block(ME, OTHER)).to.be.rejectedWith({
      statusCode: 404,
    });
    await expect(service.block(ME, 'abc')).to.be.rejectedWith({
      statusCode: 404,
    });
    expect(repository.stubs.block.called).to.be.false();
  });

  it('desbloqueia só o que o próprio usuário bloqueou', async () => {
    repository.stubs.unblock.resolves(true);
    await service.unblock(ME, OTHER);
    sinon.assert.calledOnceWithExactly(repository.stubs.unblock, ME, OTHER);

    repository.stubs.unblock.resolves(false);
    await expect(service.unblock(ME, OTHER)).to.be.rejectedWith({
      statusCode: 404,
    });
  });

  it('lista os bloqueados do usuário, paginada', async () => {
    repository.stubs.findBlocked.resolves([
      {id: OTHER, username: 'gorak', blocked_at: new Date(0), total_count: 1},
    ]);
    const list = await service.listBlocked(ME);
    sinon.assert.calledOnceWithExactly(repository.stubs.findBlocked, ME, 20, 1);
    expect(list.items).to.eql([
      {id: OTHER, username: 'gorak', blocked_at: new Date(0)},
    ]);
  });

  it('isBlockedEither vale nas duas direções', async () => {
    repository.stubs.blockStatus.resolves({byMe: false, byThem: true});
    expect(await service.isBlockedEither(ME, OTHER)).to.be.true();
    repository.stubs.blockStatus.resolves({byMe: true, byThem: false});
    expect(await service.isBlockedEither(ME, OTHER)).to.be.true();
    repository.stubs.blockStatus.resolves({byMe: false, byThem: false});
    expect(await service.isBlockedEither(ME, OTHER)).to.be.false();
  });
});
