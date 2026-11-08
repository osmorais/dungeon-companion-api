/* eslint-disable @typescript-eslint/naming-convention */
import {inject, service} from '@loopback/core';
import {get, param, patch, post, response} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {NotificationService} from '../services/notification.service';
import {NotificationView} from '../models/social-event-types';
import {PagedList} from '../models/friend-types';

/** Notificações (1.18.0) — sempre só as do usuário logado. */
@authenticate('jwt')
export class NotificationController {
  constructor(
    @service(NotificationService)
    private notificationService: NotificationService,
  ) {}

  @get('/api/notifications')
  @response(200, {description: 'Notificações do usuário, mais novas primeiro'})
  async list(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @param.query.boolean('unread') unread?: boolean,
    @param.query.number('page') page?: number,
    @param.query.number('pageSize') pageSize?: number,
  ): Promise<PagedList<NotificationView>> {
    return this.notificationService.list(
      currentUser.id,
      unread === true,
      page,
      pageSize,
    );
  }

  @get('/api/notifications/unread-count')
  @response(200, {description: 'Quantas notificações não lidas'})
  async unreadCount(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<{count: number}> {
    return this.notificationService.unreadCount(currentUser.id);
  }

  @patch('/api/notifications/{id}/read')
  @response(204, {description: 'Marca a notificação como lida'})
  async markRead(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<void> {
    await this.notificationService.markRead(id, currentUser.id);
  }

  @post('/api/notifications/read-all')
  @response(200, {description: 'Marca todas como lidas'})
  async markAllRead(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<{updated: number}> {
    return this.notificationService.markAllRead(currentUser.id);
  }
}
