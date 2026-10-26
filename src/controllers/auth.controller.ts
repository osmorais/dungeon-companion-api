/* eslint-disable @typescript-eslint/naming-convention */
import {inject, service} from '@loopback/core';
import {
  get,
  param,
  post,
  Request,
  requestBody,
  Response,
  RestBindings,
} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {UserProfile, SecurityBindings, securityId} from '@loopback/security';
import {AuthService} from '../services/auth.service';
import {EmailService} from '../services/email.service';
import {clientIp, RateLimitService} from '../services/rate-limit.service';
import {UsernameCheck, UsernameService} from '../services/username.service';

/** Mínimo pra senha nova (cadastro e redefinição). Contas antigas com 6-7 continuam entrando. */
export const PASSWORD_MIN_LENGTH = 8;

export const COOKIE_NAME = 'token';
const IS_PROD = process.env.NODE_ENV === 'production';

// Cross-origin (Hostinger → Render) requires SameSite=None + Secure.
// SameSite=None without Secure is rejected by all modern browsers.
// In local dev we use Lax so cookies work over plain HTTP.
function cookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? ('none' as const) : ('lax' as const),
    maxAge: 8 * 60 * 60 * 1000, // 8h in ms
    path: '/',
  };
}

export function clearCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? ('none' as const) : ('lax' as const),
    path: '/',
  };
}

export class AuthController {
  constructor(
    @service(AuthService) private authService: AuthService,
    @service(EmailService) private emailService: EmailService,
    @service(RateLimitService) private rateLimit: RateLimitService,
    @service(UsernameService) private usernameService: UsernameService,
  ) {}

  @authenticate.skip()
  @post('/auth/signup', {
    responses: {'200': {description: 'Signup'}},
  })
  async signup(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'password', 'username'],
            properties: {
              email: {type: 'string', format: 'email'},
              password: {type: 'string', minLength: PASSWORD_MIN_LENGTH},
              username: {type: 'string'},
            },
          },
        },
      },
    })
    body: {email: string; password: string; username: string},
    @inject(RestBindings.Http.REQUEST) request: Request,
    @inject(RestBindings.Http.RESPONSE) response: Response,
  ) {
    this.rateLimit.consume('signupIp', clientIp(request));
    const {token, user} = await this.authService.signup(
      body.email,
      body.password,
      body.username,
    );
    response.cookie(COOKIE_NAME, token, cookieOptions());
    return {token, user};
  }

  @authenticate.skip()
  @post('/auth/login', {
    responses: {'200': {description: 'Login'}},
  })
  async login(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
              email: {type: 'string'},
              password: {type: 'string'},
            },
          },
        },
      },
    })
    body: {email: string; password: string},
    @inject(RestBindings.Http.REQUEST) request: Request,
    @inject(RestBindings.Http.RESPONSE) response: Response,
  ) {
    this.rateLimit.consume('loginIp', clientIp(request));
    this.rateLimit.consume('loginEmail', body.email);
    const {token, user} = await this.authService.login(body.email, body.password);
    response.cookie(COOKIE_NAME, token, cookieOptions());
    return {token, user};
  }

  @authenticate.skip()
  @post('/auth/logout', {
    responses: {'200': {description: 'Logout'}},
  })
  async logout(@inject(RestBindings.Http.RESPONSE) response: Response) {
    response.clearCookie(COOKIE_NAME, clearCookieOptions());
    return {message: 'Logout realizado com sucesso.'};
  }

  @authenticate.skip()
  @post('/auth/forgot-password', {
    responses: {'200': {description: 'Forgot password'}},
  })
  async forgotPassword(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email'],
            properties: {email: {type: 'string', format: 'email'}},
          },
        },
      },
    })
    body: {email: string},
    @inject(RestBindings.Http.REQUEST) request: Request,
  ) {
    this.rateLimit.consume('forgotPasswordIp', clientIp(request));
    this.rateLimit.consume('forgotPasswordEmail', body.email);
    const token = await this.authService.forgotPassword(body.email);
    if (token) {
      // Mesma resposta com ou sem conta: um erro só quando o e-mail existe revelaria quem tem
      // conta. A falha fica no log, sem o endereço.
      try {
        await this.emailService.sendPasswordReset(body.email, token);
      } catch (err) {
        console.error(
          '[auth] e-mail de recuperação não enviado:',
          (err as Error).message,
        );
      }
    }
    return {message: 'Se o e-mail existir, você receberá as instruções em breve.'};
  }

  @authenticate.skip()
  @post('/auth/reset-password', {
    responses: {'200': {description: 'Reset password'}},
  })
  async resetPassword(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['token', 'newPassword'],
            properties: {
              token: {type: 'string'},
              newPassword: {type: 'string', minLength: PASSWORD_MIN_LENGTH},
            },
          },
        },
      },
    })
    body: {token: string; newPassword: string},
    @inject(RestBindings.Http.REQUEST) request: Request,
  ) {
    this.rateLimit.consume('resetPasswordIp', clientIp(request));
    await this.authService.resetPassword(body.token, body.newPassword);
    return {message: 'Senha redefinida com sucesso.'};
  }

  @authenticate.skip()
  @post('/auth/google', {
    responses: {'200': {description: 'Google OAuth login'}},
  })
  async googleAuth(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['idToken'],
            properties: {idToken: {type: 'string'}},
          },
        },
      },
    })
    body: {idToken: string},
    @inject(RestBindings.Http.REQUEST) request: Request,
    @inject(RestBindings.Http.RESPONSE) response: Response,
  ) {
    this.rateLimit.consume('googleIp', clientIp(request));
    const {token, user} = await this.authService.googleAuth(body.idToken);
    response.cookie(COOKIE_NAME, token, cookieOptions());
    return {token, user};
  }

  /**
   * O nome de usuário está livre? Se não, devolve sugestões. Pública porque o cadastro pergunta
   * antes de existir conta; os nomes de usuário já são públicos (mesa, ranking), mas a rota tem
   * limite pra não servir de varredura.
   */
  @authenticate.skip()
  @get('/auth/username-available', {
    responses: {'200': {description: 'Disponibilidade do nome de usuário'}},
  })
  async usernameAvailable(
    @param.query.string('username') username: string,
    @inject(RestBindings.Http.REQUEST) request: Request,
  ): Promise<UsernameCheck> {
    this.rateLimit.consume('usernameCheckIp', clientIp(request));
    return this.usernameService.check(username ?? '');
  }

  @authenticate('jwt')
  @get('/auth/me', {
    responses: {'200': {description: 'Current user profile'}},
  })
  async me(@inject(SecurityBindings.USER) currentUser: UserProfile) {
    return this.authService.me(currentUser[securityId]);
  }
}
