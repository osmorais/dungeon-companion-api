import {injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {PlayerInventoryRepository} from '../repositories/player-inventory.repository';
import {
  AddInventoryItemInput,
  InventoryItem,
  ItemCatalogEntry,
} from '../models/player-inventory-types';

@injectable({scope: BindingScope.TRANSIENT})
export class PlayerInventoryService {
  constructor(
    @service(PlayerInventoryRepository)
    private repository: PlayerInventoryRepository,
  ) {}

  async getItemCatalog(): Promise<ItemCatalogEntry[]> {
    return this.repository.findItemCatalog();
  }

  async getInventory(
    idPlayerSession: string,
    userId: string,
  ): Promise<InventoryItem[]> {
    const canManage = await this.repository.canManageInventory(
      idPlayerSession,
      userId,
    );
    if (!canManage)
      throw new HttpErrors.Forbidden('Você não pode ver esse inventário');
    return this.repository.findInventory(idPlayerSession);
  }

  async addItem(
    idPlayerSession: string,
    userId: string,
    input: AddInventoryItemInput,
  ): Promise<InventoryItem> {
    const canManage = await this.repository.canManageInventory(
      idPlayerSession,
      userId,
    );
    if (!canManage)
      throw new HttpErrors.Forbidden(
        'Você não pode adicionar itens nesse inventário',
      );

    const quantity = input.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1)
      throw new HttpErrors.UnprocessableEntity(
        'quantity deve ser um inteiro positivo',
      );

    const added = await this.repository.addItem(idPlayerSession, {
      ...input,
      quantity,
    });
    if (!added)
      throw new HttpErrors.NotFound(
        `Item com id ${input.id_item} não encontrado no catálogo`,
      );
    return added;
  }

  /** `null` no retorno = a quantidade zerou e o item saiu do inventário. */
  async adjustQuantity(
    idInventoryItem: string,
    userId: string,
    delta: number,
  ): Promise<InventoryItem | null> {
    if (!Number.isInteger(delta) || delta === 0)
      throw new HttpErrors.UnprocessableEntity(
        'delta deve ser um inteiro diferente de zero',
      );

    const context =
      await this.repository.findInventoryItemContext(idInventoryItem);
    if (!context)
      throw new HttpErrors.NotFound('Item de inventário não encontrado');
    if (context.player_user_id !== userId && context.dm_user_id !== userId)
      throw new HttpErrors.Forbidden('Você não pode alterar esse item');

    return this.repository.adjustQuantity(idInventoryItem, delta);
  }

  async removeItem(idInventoryItem: string, userId: string): Promise<void> {
    const context =
      await this.repository.findInventoryItemContext(idInventoryItem);
    if (!context)
      throw new HttpErrors.NotFound('Item de inventário não encontrado');
    if (context.player_user_id !== userId && context.dm_user_id !== userId)
      throw new HttpErrors.Forbidden('Você não pode remover esse item');

    await this.repository.removeItem(idInventoryItem);
  }
}
