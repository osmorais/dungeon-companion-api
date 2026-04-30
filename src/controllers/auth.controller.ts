/* eslint-disable @typescript-eslint/naming-convention */
import {inject, service} from '@loopback/core';
import {get, post, requestBody, Response, RestBindings} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {UserProfile, SecurityBindings, securityId} from '@loopback/security';
import {AuthService} from '../services/auth.service';
import {EmailService} from '../services/email.service';

const COOKIE_NAME = 'token';
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

function clearCookieOptions() {
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
            required: ['email', 'password'],
            properties: {
              email: {type: 'string', format: 'email'},
              password: {type: 'string', minLength: 6},
              full_name: {type: 'string'},
            },
          },
        },
      },
    })
    body: {email: string; password: string; full_name?: string},
    @inject(RestBindings.Http.RESPONSE) response: Response,
  ) {
    const {token, user} = await this.authService.signup(
      body.email,
      body.password,
      body.full_name,
    );
    response.cookie(COOKIE_NAME, token, cookieOptions());
    return {user};
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
    @inject(RestBindings.Http.RESPONSE) response: Response,
  ) {
    const {token, user} = await this.authService.login(body.email, body.password);
    response.cookie(COOKIE_NAME, token, cookieOptions());
    return {user};
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
  ) {
    const token = await this.authService.forgotPassword(body.email);
    if (token) {
      await this.emailService.sendPasswordReset(body.email, token);
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
              newPassword: {type: 'string', minLength: 6},
            },
          },
        },
      },
    })
    body: {token: string; newPassword: string},
  ) {
    await this.authService.resetPassword(body.token, body.newPassword);
    return {message: 'Senha redefinida com sucesso.'};
  }

  @authenticate('jwt')
  @get('/auth/me', {
    responses: {'200': {description: 'Current user profile'}},
  })
  async me(@inject(SecurityBindings.USER) currentUser: UserProfile) {
    return {id: currentUser[securityId], email: currentUser.email};
  }
}
