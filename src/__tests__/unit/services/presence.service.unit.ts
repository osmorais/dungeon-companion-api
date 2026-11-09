/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {
  PRESENCE_TTL_MS,
  PresenceService,
  visiblePresence,
} from '../../../services/presence.service';

describe('PresenceService', () => {
  let presence: PresenceService;
  let now: number;
  let changes: string[];

  beforeEach(() => {
    presence = new PresenceService();
    now = 1_000_000;
    presence.now = () => now;
    changes = [];
    presence.onChange(id => changes.push(id));
  });

  it('começa offline, fica online ao conectar e avisa uma vez', () => {
    expect(presence.live('u1').presence).to.equal('offline');
    presence.connect('u1', 'aba1');
    expect(presence.live('u1').presence).to.equal('online');
    expect(changes).to.eql(['u1']);
  });

  it('várias abas: só fica offline quando a última fecha', () => {
    presence.connect('u1', 'aba1');
    presence.connect('u1', 'aba2');
    presence.disconnect('u1', 'aba1');
    expect(presence.isConnected('u1')).to.be.true();
    presence.disconnect('u1', 'aba2');
    expect(presence.isConnected('u1')).to.be.false();
    expect(changes).to.eql(['u1', 'u1']);
  });

  it('desconectar conexão desconhecida não muda nada', () => {
    presence.disconnect('u1', 'x');
    expect(changes).to.eql([]);
  });

  it('conexão sem heartbeat expira no TTL (não fica online pra sempre)', () => {
    presence.connect('u1', 'aba1');
    now += PRESENCE_TTL_MS - 1;
    expect(presence.sweep()).to.eql([]);
    now += 2;
    expect(presence.sweep()).to.eql(['u1']);
    expect(presence.isConnected('u1')).to.be.false();
  });

  it('heartbeat renova o TTL', () => {
    presence.connect('u1', 'aba1');
    now += PRESENCE_TTL_MS - 1000;
    presence.heartbeat('u1', 'aba1');
    now += 2000;
    expect(presence.sweep()).to.eql([]);
  });

  it('heartbeat de conexão que já tinha expirado reconecta', () => {
    presence.heartbeat('u1', 'aba1');
    expect(presence.isConnected('u1')).to.be.true();
  });

  it('status escolhido não se confunde com offline', () => {
    presence.setChoice('u1', {status: 'away'});
    expect(presence.live('u1').presence).to.equal('offline');
    presence.connect('u1', 'aba1');
    expect(presence.live('u1').presence).to.equal('away');
    presence.setChoice('u1', {status: 'busy', availability: 'available'});
    expect(presence.mine('u1')).to.eql({
      status: 'busy',
      availability: 'available',
      connected: true,
    });
  });

  it('escolher o mesmo status de novo não avisa', () => {
    presence.setChoice('u1', {status: 'away'});
    presence.setChoice('u1', {status: 'away'});
    expect(changes).to.eql(['u1']);
  });

  it('onlineUserIds lista os conectados', () => {
    presence.connect('u1', 'a');
    presence.connect('u2', 'b');
    expect(presence.onlineUserIds().sort()).to.eql(['u1', 'u2']);
  });
});

describe('visiblePresence', () => {
  const live = {presence: 'busy' as const, availability: 'available' as const};
  const offline = {
    presence: 'offline' as const,
    availability: 'available' as const,
  };
  const seen = new Date('2026-11-03T10:00:00Z');

  it('amigos veem status e disponibilidade', () => {
    expect(
      visiblePresence(live, {
        presence_visibility: 'friends',
        show_last_seen: true,
        last_access_at: seen,
      }),
    ).to.eql({presence: 'busy', availability: 'available', last_seen_at: null});
  });

  it("'nobody': sempre offline, sem última atividade", () => {
    expect(
      visiblePresence(live, {
        presence_visibility: 'nobody',
        show_last_seen: true,
        last_access_at: seen,
      }),
    ).to.eql({presence: 'offline', availability: null, last_seen_at: null});
  });

  it('offline mostra a última atividade só com show_last_seen', () => {
    const privacy = {
      presence_visibility: 'friends',
      show_last_seen: false,
      last_access_at: seen,
    };
    expect(visiblePresence(offline, privacy).last_seen_at).to.be.null();
    expect(
      visiblePresence(offline, {...privacy, show_last_seen: true}).last_seen_at,
    ).to.eql(seen);
  });
});
