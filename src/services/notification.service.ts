/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {
  NewNotification,
  NotificationRepository,
} from '../repositories/notification.repository';
import {NotificationView} from '../models/social-event-types';
import {PagedList} from '../models/friend-types';
import {SocialEventsService} from './social-events.service';
import {isUuid, resolvePaging, toPagedList} from './friend-rules';

/**
 * Notificações persistidas + aviso em tempo real. `notify` é chamado depois que a ação principal
 * já foi gravada; falha aqui só vai pro log (nunca desfaz nem derruba a ação). Cada notificação
 * tem uma `dedupe_key`, então repetir a chamada não duplica.
 */
@injectable({scope: BindingScope.TRANSIENT})
export class NotificationService {
  constructor(
    @service(NotificationRepository)
    private repository: NotificationRepository,
    @service(SocialEventsService)
    private events: SocialEventsService,
  ) {}

  async notify(input: NewNotification): Promise<void> {
    try {
      const notification = await this.repository.create(input);
      if (notification)
        this.events.publish({
          type: 'notification_created',
          user_id: input.user_id,
          notification,
        });
    } catch (err) {
      // Sem dado pessoal no log: só o tipo e a mensagem do erro.
      console.error(
        `[notification] não gravou ${input.type}:`,
        (err as Error).message,
      );
    }
  }

  async list(
    userId: string,
    unreadOnly: boolean,
    page?: number,
    pageSize?: number,
  ): Promise<PagedList<NotificationView>> {
    const paging = resolvePaging(page, pageSize);
    const rows = await this.repository.findForUser(
      userId,
      unreadOnly,
      paging.pageSize,
      paging.page,
    );
    return toPagedList(rows, paging.page, paging.pageSize);
  }

  async unreadCount(userId: string): Promise<{count: number}> {
    return {count: await this.repository.countUnread(userId)};
  }

  /** Notificação de outra pessoa é 404 (igual a inexistente). */
  async markRead(id: string, userId: string): Promise<void> {
    const found = isUuid(id) && (await this.repository.markRead(id, userId));
    if (!found) throw new HttpErrors.NotFound('Notificação não encontrada');
  }

  async markAllRead(userId: string): Promise<{updated: number}> {
    return {updated: await this.repository.markAllRead(userId)};
  }
}
