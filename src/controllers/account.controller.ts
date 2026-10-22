/* eslint-disable @typescript-eslint/naming-convention */
import {inject, service} from '@loopback/core';
import {
  get,
  patch,
  post,
  requestBody,
  response,
  Response,
  RestBindings,
} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {AccountService} from '../services/account.service';
import {RateLimitService} from '../services/rate-limit.service';
import {
  AccountExport,
  AccountProfile,
  DeleteAccountInput,
  UpdateAccountInput,
} from '../models/account-types';
import {clearCookieOptions, COOKIE_NAME} from './auth.controller';

/** Conta do próprio usuário logado — direitos do titular (LGPD art. 18). */
@authenticate('jwt')
export class AccountController {
  constructor(
    @service(AccountService)
    private accountService: AccountService,
    @service(RateLimitService)
    private rateLimit: RateLimitService,
  ) {}

  @get('/api/account')
  @response(200, {description: 'Perfil da conta do usuário logado'})
  async getProfile(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<AccountProfile> {
    return this.accountService.getProfile(currentUser.id);
  }

  @patch('/api/account')
  @response(200, {description: 'Atualiza o nome de exibição da conta'})
  async updateProfile(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              full_name: {type: 'string', nullable: true},
              show_in_ranking: {type: 'boolean'},
            },
          },
        },
      },
    })
    body: UpdateAccountInput,
  ): Promise<AccountProfile> {
    return this.accountService.updateProfile(currentUser.id, body);
  }

  @get('/api/account/export')
  @response(200, {description: 'Exporta todos os dados da conta em JSON'})
  async exportData(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<AccountExport> {
    return this.accountService.exportData(currentUser.id);
  }

  // POST em vez de DELETE com corpo: corpo em DELETE nem sempre passa por proxies/CDNs.
  @post('/api/account/delete')
  @response(200, {description: 'Exclui a conta e todos os dados dela'})
  async deleteAccount(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['confirm_email'],
            properties: {
              confirm_email: {type: 'string'},
              password: {type: 'string'},
            },
          },
        },
      },
    })
    body: DeleteAccountInput,
    @inject(RestBindings.Http.RESPONSE) httpResponse: Response,
  ): Promise<{message: string}> {
    // A confirmação pede a senha — sem limite, viraria um jeito de testar senhas com o token.
    this.rateLimit.consume('accountDeleteUser', currentUser.id);
    await this.accountService.deleteAccount(currentUser.id, body);
    httpResponse.clearCookie(COOKIE_NAME, clearCookieOptions());
    return {message: 'Conta excluída.'};
  }
}
