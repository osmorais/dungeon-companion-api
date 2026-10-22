/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {AccountRepository} from '../repositories/account.repository';
import {
  AccountExport,
  AccountProfile,
  DeleteAccountInput,
  UpdateAccountInput,
} from '../models/account-types';
import {AuthService} from './auth.service';
import {CharacterSheetService} from './character-sheet.service';
import {ImageCleanupService} from './image-cleanup.service';

const FULL_NAME_MAX_LENGTH = 255;
export const EXPORT_SHEET_WARNING =
  'Não foi possível montar a ficha completa deste personagem; seguem os dados básicos.';

/**
 * Direitos do titular (LGPD art. 18): ver/corrigir o perfil, exportar os dados e excluir a conta.
 * Erros de confirmação usam 422, não 401 — o frontend trata 401 fora de /auth/ como sessão
 * expirada e desloga o usuário.
 */
@injectable({scope: BindingScope.TRANSIENT})
export class AccountService {
  constructor(
    @service(AccountRepository)
    private repository: AccountRepository,
    // CharacterSheetService é bindado duas vezes (manual em application.ts + boot), por isso a
    // chave literal em vez de @service().
    @inject('services.CharacterSheetService')
    private characterSheetService: CharacterSheetService,
    @service(AuthService)
    private authService: AuthService,
    @service(ImageCleanupService)
    private imageCleanup: ImageCleanupService,
  ) {}

  async getProfile(userId: string): Promise<AccountProfile> {
    const row = await this.repository.findProfile(userId);
    if (!row) throw new HttpErrors.NotFound('Conta não encontrada');
    return toProfile(row);
  }

  async updateProfile(
    userId: string,
    input: UpdateAccountInput,
  ): Promise<AccountProfile> {
    if (input.full_name !== undefined) {
      const trimmed = input.full_name?.trim() ?? '';
      const fullName = trimmed.length ? trimmed : null;
      if (fullName && fullName.length > FULL_NAME_MAX_LENGTH) {
        throw new HttpErrors.UnprocessableEntity(
          `O nome pode ter no máximo ${FULL_NAME_MAX_LENGTH} caracteres`,
        );
      }
      await this.repository.updateFullName(userId, fullName);
    }
    if (input.show_in_ranking !== undefined) {
      if (typeof input.show_in_ranking !== 'boolean')
        throw new HttpErrors.UnprocessableEntity('show_in_ranking inválido');
      await this.repository.updateShowInRanking(userId, input.show_in_ranking);
    }
    return this.getProfile(userId);
  }

  async exportData(userId: string): Promise<AccountExport> {
    const account = await this.getProfile(userId);
    const characters: object[] = [];
    for (const basic of await this.repository.findCharacters(userId)) {
      // Uma ficha que não monta (dado antigo/incompleto) não pode impedir o usuário de baixar o
      // resto: entra com os dados básicos e um aviso.
      try {
        const sheet = await this.characterSheetService.loadCharacter(
          basic.id_character,
          userId,
        );
        characters.push(sheet ?? {...basic, aviso: EXPORT_SHEET_WARNING});
      } catch {
        characters.push({...basic, aviso: EXPORT_SHEET_WARNING});
      }
    }
    const [
      sessionsAsDm,
      sessionsAsPlayer,
      monsterCatalog,
      rolls,
      rankingStats,
    ] = await Promise.all([
      this.repository.findDmSessions(userId),
      this.repository.findParticipations(userId),
      this.repository.findCatalogMonsters(userId),
      this.repository.findRolls(userId),
      this.repository.findRankingStats(userId),
    ]);
    return {
      exported_at: new Date().toISOString(),
      account,
      characters,
      sessions_as_dm: sessionsAsDm,
      sessions_as_player: sessionsAsPlayer,
      monster_catalog: monsterCatalog,
      rolls,
      ranking_stats: rankingStats,
    };
  }

  async deleteAccount(
    userId: string,
    input: DeleteAccountInput,
  ): Promise<void> {
    const row = await this.repository.findProfile(userId);
    if (!row) throw new HttpErrors.NotFound('Conta não encontrada');

    const typedEmail = (input.confirm_email ?? '').trim().toLowerCase();
    if (typedEmail !== row.email.trim().toLowerCase()) {
      throw new HttpErrors.UnprocessableEntity(
        'O e-mail digitado não confere com o da conta',
      );
    }
    if (row.password_hash) {
      const valid =
        !!input.password &&
        (await this.authService.comparePassword(
          input.password,
          row.password_hash,
        ));
      if (!valid) throw new HttpErrors.UnprocessableEntity('Senha incorreta');
    }

    const {imageUrls} = await this.repository.deleteAccount(userId);
    await this.imageCleanup.deleteIfUnreferenced(imageUrls);
  }
}

function toProfile(
  row: AccountProfile & {password_hash: string | null},
): AccountProfile {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    created_at: row.created_at,
    has_password: row.has_password,
    google_linked: row.google_linked,
    show_in_ranking: row.show_in_ranking ?? true,
  };
}
