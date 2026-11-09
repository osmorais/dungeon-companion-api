/* eslint-disable @typescript-eslint/naming-convention */
import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {
  AccountService,
  EXPORT_SHEET_WARNING,
} from '../../../services/account.service';
import {AuthService} from '../../../services/auth.service';
import {CharacterSheetService} from '../../../services/character-sheet.service';
import {ImageCleanupService} from '../../../services/image-cleanup.service';
import {UsernameService} from '../../../services/username.service';
import {PresenceService} from '../../../services/presence.service';
import {AccountRepository} from '../../../repositories/account.repository';
import {AccountProfile} from '../../../models/account-types';
import {CharacterSheet} from '../../../models/character-sheet-types';

function profileRow(
  overrides: Partial<AccountProfile & {password_hash: string | null}> = {},
): AccountProfile & {password_hash: string | null} {
  return {
    id: 'u1',
    email: 'Heroi@Aventura.com',
    full_name: 'Sir Aldric',
    username: 'aldric',
    created_at: null,
    has_password: true,
    google_linked: false,
    show_in_ranking: true,
    last_access_at: new Date('2026-11-01T10:00:00Z'),
    discoverable: true,
    accept_friend_requests: true,
    presence_visibility: 'friends',
    show_last_seen: false,
    password_hash: 'hash',
    ...overrides,
  };
}

describe('AccountService', () => {
  let repository: StubbedInstanceWithSinonAccessor<AccountRepository>;
  let sheets: StubbedInstanceWithSinonAccessor<CharacterSheetService>;
  let auth: StubbedInstanceWithSinonAccessor<AuthService>;
  let imageCleanup: StubbedInstanceWithSinonAccessor<ImageCleanupService>;
  let usernames: StubbedInstanceWithSinonAccessor<UsernameService>;
  let presence: StubbedInstanceWithSinonAccessor<PresenceService>;
  let service: AccountService;

  beforeEach(() => {
    repository = createStubInstance(AccountRepository);
    sheets = createStubInstance(CharacterSheetService);
    auth = createStubInstance(AuthService);
    imageCleanup = createStubInstance(ImageCleanupService);
    usernames = createStubInstance(UsernameService);
    presence = createStubInstance(PresenceService);
    repository.stubs.findProfile.resolves(profileRow());
    repository.stubs.deleteAccount.resolves({imageUrls: ['https://x/a.png']});
    auth.stubs.comparePassword.resolves(true);
    service = new AccountService(
      repository,
      sheets,
      auth,
      imageCleanup,
      usernames,
      presence,
    );
  });

  afterEach(() => sinon.restore());

  // -------------------------------------------------------------------------
  describe('perfil', () => {
    it('não devolve o hash da senha', async () => {
      const profile = await service.getProfile('u1');
      expect(profile).to.eql({
        id: 'u1',
        email: 'Heroi@Aventura.com',
        full_name: 'Sir Aldric',
        username: 'aldric',
        created_at: null,
        has_password: true,
        google_linked: false,
        show_in_ranking: true,
        last_access_at: new Date('2026-11-01T10:00:00Z'),
        discoverable: true,
        accept_friend_requests: true,
        presence_visibility: 'friends',
        show_last_seen: false,
      });
      expect(profile).to.not.have.property('password_hash');
    });

    it('conta inexistente', async () => {
      repository.stubs.findProfile.resolves(undefined);
      await expect(service.getProfile('u1')).to.be.rejectedWith(
        /Conta não encontrada/,
      );
    });

    it('nome é aparado; vazio vira null', async () => {
      await service.updateProfile('u1', {full_name: '  Elora  '});
      sinon.assert.calledWith(repository.stubs.updateFullName, 'u1', 'Elora');
      await service.updateProfile('u1', {full_name: '   '});
      sinon.assert.calledWith(repository.stubs.updateFullName, 'u1', null);
    });

    it('nome longo demais é recusado', async () => {
      await expect(
        service.updateProfile('u1', {full_name: 'a'.repeat(256)}),
      ).to.be.rejectedWith(/no máximo 255/);
      expect(repository.stubs.updateFullName.called).to.be.false();
    });

    it('sem full_name no corpo não altera nada', async () => {
      await service.updateProfile('u1', {});
      expect(repository.stubs.updateFullName.called).to.be.false();
      expect(repository.stubs.updateShowInRanking.called).to.be.false();
      expect(usernames.stubs.setUsername.called).to.be.false();
    });

    it('troca o nome de usuário pela regra de unicidade (do próprio usuário)', async () => {
      usernames.stubs.setUsername.resolves('gorak');
      await service.updateProfile('u1', {username: 'gorak'});
      sinon.assert.calledWith(usernames.stubs.setUsername, 'u1', 'gorak');
    });

    it('nome de usuário em uso: o 409 com sugestões passa adiante', async () => {
      const taken = Object.assign(new Error('em uso'), {statusCode: 409});
      usernames.stubs.setUsername.rejects(taken);
      await expect(
        service.updateProfile('u1', {username: 'gorak'}),
      ).to.be.rejectedWith({statusCode: 409});
    });

    it('nome de usuário que não é texto: 422', async () => {
      await expect(
        service.updateProfile('u1', {username: 42 as never}),
      ).to.be.rejectedWith({statusCode: 422});
      expect(usernames.stubs.setUsername.called).to.be.false();
    });

    it('perfil sem nome de usuário (conta antiga) devolve null', async () => {
      repository.stubs.findProfile.resolves(profileRow({username: null}));
      expect((await service.getProfile('u1')).username).to.be.null();
    });

    it('sair e voltar pro ranking', async () => {
      await service.updateProfile('u1', {show_in_ranking: false});
      sinon.assert.calledWith(
        repository.stubs.updateShowInRanking,
        'u1',
        false,
      );
      expect(repository.stubs.updateFullName.called).to.be.false();
    });

    it('show_in_ranking que não é booleano é recusado', async () => {
      await expect(
        service.updateProfile('u1', {
          show_in_ranking: 'não' as unknown as boolean,
        }),
      ).to.be.rejectedWith({statusCode: 422});
      expect(repository.stubs.updateShowInRanking.called).to.be.false();
    });

    it('privacidade dos amigos: grava só o que veio no corpo', async () => {
      await service.updateProfile('u1', {discoverable: false});
      sinon.assert.calledWith(repository.stubs.updateSocialPreferences, 'u1', {
        discoverable: false,
        accept_friend_requests: undefined,
        presence_visibility: undefined,
        show_last_seen: undefined,
      });
      await service.updateProfile('u1', {accept_friend_requests: false});
      sinon.assert.calledWith(repository.stubs.updateSocialPreferences, 'u1', {
        discoverable: undefined,
        accept_friend_requests: false,
        presence_visibility: undefined,
        show_last_seen: undefined,
      });
      expect(presence.stubs.touch.called).to.be.false();
    });

    it('privacidade da presença: grava e avisa os amigos na hora', async () => {
      await service.updateProfile('u1', {presence_visibility: 'nobody'});
      sinon.assert.calledWith(repository.stubs.updateSocialPreferences, 'u1', {
        discoverable: undefined,
        accept_friend_requests: undefined,
        presence_visibility: 'nobody',
        show_last_seen: undefined,
      });
      sinon.assert.calledOnceWithExactly(presence.stubs.touch, 'u1');
      await service.updateProfile('u1', {show_last_seen: true});
      sinon.assert.calledTwice(presence.stubs.touch);
    });

    it('presence_visibility fora da lista é recusado', async () => {
      await expect(
        service.updateProfile('u1', {
          presence_visibility: 'todos' as never,
        }),
      ).to.be.rejectedWith({statusCode: 422});
      await expect(
        service.updateProfile('u1', {show_last_seen: 'sim' as never}),
      ).to.be.rejectedWith({statusCode: 422});
      expect(repository.stubs.updateSocialPreferences.called).to.be.false();
    });

    it('sem preferência de amigos no corpo não grava', async () => {
      await service.updateProfile('u1', {show_in_ranking: true});
      expect(repository.stubs.updateSocialPreferences.called).to.be.false();
    });

    it('preferência de amigos que não é booleana é recusada', async () => {
      await expect(
        service.updateProfile('u1', {
          discoverable: 'sim' as unknown as boolean,
        }),
      ).to.be.rejectedWith({statusCode: 422});
      await expect(
        service.updateProfile('u1', {
          accept_friend_requests: 1 as unknown as boolean,
        }),
      ).to.be.rejectedWith({statusCode: 422});
      expect(repository.stubs.updateSocialPreferences.called).to.be.false();
    });

    it('conta antiga sem as colunas novas: padrão é encontrável e aceitando pedidos', async () => {
      repository.stubs.findProfile.resolves(
        profileRow({
          discoverable: undefined as unknown as boolean,
          accept_friend_requests: undefined as unknown as boolean,
        }),
      );
      const profile = await service.getProfile('u1');
      expect(profile.discoverable).to.be.true();
      expect(profile.accept_friend_requests).to.be.true();
    });
  });

  // -------------------------------------------------------------------------
  describe('exportação', () => {
    it('junta perfil, fichas completas, sessões, catálogo e rolagens', async () => {
      repository.stubs.findCharacters.resolves([
        {id_character: 1, name: 'Thorin', level: 3},
      ]);
      sheets.stubs.loadCharacter
        .withArgs(1, 'u1')
        .resolves({character_name: 'Thorin'} as unknown as CharacterSheet);
      repository.stubs.findDmSessions.resolves([]);
      repository.stubs.findParticipations.resolves([]);
      repository.stubs.findCatalogMonsters.resolves([]);
      repository.stubs.findRolls.resolves([]);
      repository.stubs.findRankingStats.resolves([{id_character: 1, nat20: 3}]);
      const social = {
        friends: [{username: 'gorak', friends_since: new Date(0)}],
        friend_requests: [],
        blocked: [],
        notifications: [],
        session_invites: [],
      };
      repository.stubs.findSocial.resolves(social);

      const data = await service.exportData('u1');
      expect(data.social).to.eql(social);
      expect(data.ranking_stats).to.eql([{id_character: 1, nat20: 3}]);
      expect(data.account.email).to.equal('Heroi@Aventura.com');
      expect(data.account).to.not.have.property('password_hash');
      expect(data.characters).to.eql([{character_name: 'Thorin'}]);
      expect(data).to.containDeep({
        sessions_as_dm: [],
        sessions_as_player: [],
        monster_catalog: [],
        rolls: [],
      });
      expect(data.exported_at).to.match(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('ficha que não monta entra com os dados básicos, sem derrubar a exportação', async () => {
      repository.stubs.findCharacters.resolves([
        {id_character: 1, name: 'Quebrado', level: null},
        {id_character: 2, name: 'Sumiu', level: 1},
      ]);
      sheets.stubs.loadCharacter
        .withArgs(1, 'u1')
        .rejects(new Error('ID da classe não encontrado'));
      sheets.stubs.loadCharacter.withArgs(2, 'u1').resolves(null);
      repository.stubs.findDmSessions.resolves([]);
      repository.stubs.findParticipations.resolves([]);
      repository.stubs.findCatalogMonsters.resolves([]);
      repository.stubs.findRolls.resolves([]);

      const data = await service.exportData('u1');
      expect(data.characters).to.eql([
        {
          id_character: 1,
          name: 'Quebrado',
          level: null,
          aviso: EXPORT_SHEET_WARNING,
        },
        {id_character: 2, name: 'Sumiu', level: 1, aviso: EXPORT_SHEET_WARNING},
      ]);
    });
  });

  // -------------------------------------------------------------------------
  describe('exclusão da conta', () => {
    it('exige o e-mail da conta (sem diferenciar maiúsculas/espaços)', async () => {
      await expect(
        service.deleteAccount('u1', {
          confirm_email: 'outro@x.com',
          password: 'p',
        }),
      ).to.be.rejectedWith(/e-mail digitado não confere/);
      expect(repository.stubs.deleteAccount.called).to.be.false();

      await service.deleteAccount('u1', {
        confirm_email: '  heroi@aventura.COM ',
        password: 'p',
      });
      sinon.assert.calledOnceWithExactly(repository.stubs.deleteAccount, 'u1');
    });

    it('conta com senha exige a senha correta', async () => {
      await expect(
        service.deleteAccount('u1', {confirm_email: 'heroi@aventura.com'}),
      ).to.be.rejectedWith(/Senha incorreta/);
      auth.stubs.comparePassword.resolves(false);
      await expect(
        service.deleteAccount('u1', {
          confirm_email: 'heroi@aventura.com',
          password: 'errada',
        }),
      ).to.be.rejectedWith(/Senha incorreta/);
      expect(repository.stubs.deleteAccount.called).to.be.false();
    });

    it('erros de confirmação são 422 (401 deslogaria o usuário no frontend)', async () => {
      await expect(
        service.deleteAccount('u1', {confirm_email: 'heroi@aventura.com'}),
      ).to.be.rejectedWith({statusCode: 422});
    });

    it('conta só do Google não tem senha: basta o e-mail', async () => {
      repository.stubs.findProfile.resolves(
        profileRow({
          password_hash: null,
          has_password: false,
          google_linked: true,
        }),
      );
      await service.deleteAccount('u1', {confirm_email: 'heroi@aventura.com'});
      expect(auth.stubs.comparePassword.called).to.be.false();
      sinon.assert.calledOnce(repository.stubs.deleteAccount);
    });

    it('depois de apagar, limpa as imagens que eram da conta', async () => {
      await service.deleteAccount('u1', {
        confirm_email: 'heroi@aventura.com',
        password: 'p',
      });
      sinon.assert.callOrder(
        repository.stubs.deleteAccount,
        imageCleanup.stubs.deleteIfUnreferenced,
      );
      sinon.assert.calledWith(imageCleanup.stubs.deleteIfUnreferenced, [
        'https://x/a.png',
      ]);
    });

    it('conta inexistente', async () => {
      repository.stubs.findProfile.resolves(undefined);
      await expect(
        service.deleteAccount('u1', {confirm_email: 'x', password: 'p'}),
      ).to.be.rejectedWith(/Conta não encontrada/);
    });
  });
});
