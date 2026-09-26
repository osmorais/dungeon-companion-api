/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {
  InventoryItem,
  ItemCatalogEntry,
} from '../models/player-inventory-types';

/** Contexto de permissão de um item de inventário já existente — usado por ajustar/remover,
 *  que só recebem o id do item de inventário (não o da sessão do jogador). */
export interface InventoryItemContext {
  id_player_session: string;
  player_user_id: string | null;
  dm_user_id: string | null;
}

@injectable({scope: BindingScope.TRANSIENT})
export class PlayerInventoryRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async findItemCatalog(): Promise<ItemCatalogEntry[]> {
    return this.db.sql<ItemCatalogEntry[]>`
      SELECT id_item, name, description, price_value, weight
      FROM item
      ORDER BY name
    `;
  }

  async findInventory(idPlayerSession: string): Promise<InventoryItem[]> {
    return this.db.sql<InventoryItem[]>`
      SELECT id_inventory_item, id_player_session, id_item, name, description, price_value, weight, quantity
      FROM player_inventory_item
      WHERE id_player_session = ${idPlayerSession}
      ORDER BY name
    `;
  }

  /** Dono (jogador) ou mestre de qualquer sessão em que `idPlayerSession` participa. */
  async canManageInventory(
    idPlayerSession: string,
    userId: string,
  ): Promise<boolean> {
    const rows = await this.db.sql<{found: boolean}[]>`
      SELECT EXISTS (
        SELECT 1 FROM player_session ps
        JOIN game_session gs ON gs.id_game_session = ps.id_game_session
        WHERE ps.id_player_session = ${idPlayerSession}
          AND (ps.user_id = ${userId} OR gs.user_id = ${userId})
      ) AS found
    `;
    return rows[0].found;
  }

  async findInventoryItemContext(
    idInventoryItem: string,
  ): Promise<InventoryItemContext | null> {
    const rows = await this.db.sql<InventoryItemContext[]>`
      SELECT pii.id_player_session, ps.user_id AS player_user_id, gs.user_id AS dm_user_id
      FROM player_inventory_item pii
      JOIN player_session ps ON ps.id_player_session = pii.id_player_session
      JOIN game_session gs ON gs.id_game_session = ps.id_game_session
      WHERE pii.id_inventory_item = ${idInventoryItem}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  /** `null` = id_item não existe no catálogo. */
  async findCatalogItem(idItem: number): Promise<ItemCatalogEntry | null> {
    const rows = await this.db.sql<ItemCatalogEntry[]>`
      SELECT id_item, name, description, price_value, weight FROM item WHERE id_item = ${idItem}
    `;
    return rows[0] ?? null;
  }

  /** Soma na quantidade se o jogador já tiver esse item (UNIQUE (id_player_session, id_item)
   *  permite o upsert). `catalogItem` já deve ter sido resolvido (ver findCatalogItem). */
  async addItem(
    idPlayerSession: string,
    catalogItem: ItemCatalogEntry,
    quantity: number,
  ): Promise<InventoryItem> {
    const [row] = await this.db.sql<InventoryItem[]>`
      INSERT INTO player_inventory_item (
        id_player_session, id_item, name, description, price_value, weight, quantity
      ) VALUES (
        ${idPlayerSession}, ${catalogItem.id_item}, ${catalogItem.name}, ${catalogItem.description},
        ${catalogItem.price_value}, ${catalogItem.weight}, ${quantity}
      )
      ON CONFLICT (id_player_session, id_item)
      DO UPDATE SET quantity = player_inventory_item.quantity + EXCLUDED.quantity
      RETURNING id_inventory_item, id_player_session, id_item, name, description, price_value, weight, quantity
    `;
    return row;
  }

  /** `null` = essa sessão de jogador não tem personagem vinculado. */
  async findCharacterIdForPlayerSession(
    idPlayerSession: string,
  ): Promise<number | null> {
    const rows = await this.db.sql<{id_character: number | null}[]>`
      SELECT id_character FROM player_session WHERE id_player_session = ${idPlayerSession}
    `;
    return rows[0]?.id_character ?? null;
  }

  /**
   * Debita `cost` do PO do personagem e adiciona o item numa única transação — `FOR UPDATE`
   * trava a linha do personagem pra evitar corrida caso duas compras cheguem ao mesmo tempo.
   * `insufficient_funds` = nada foi alterado (nem PO, nem inventário).
   */
  async addItemWithDebit(
    idPlayerSession: string,
    catalogItem: ItemCatalogEntry,
    quantity: number,
    idCharacter: number,
    cost: number,
  ): Promise<{ok: true; item: InventoryItem} | {ok: false}> {
    return this.db.sql.begin(async sql => {
      const [character] = await sql<{total_po: number}[]>`
        SELECT total_po FROM character WHERE id_character = ${idCharacter} FOR UPDATE
      `;
      if (!character || character.total_po < cost) return {ok: false};

      await sql`
        UPDATE character
        SET total_po = ROUND((total_po - ${cost})::numeric, 2)
        WHERE id_character = ${idCharacter}
      `;

      const [item] = await sql<InventoryItem[]>`
        INSERT INTO player_inventory_item (
          id_player_session, id_item, name, description, price_value, weight, quantity
        ) VALUES (
          ${idPlayerSession}, ${catalogItem.id_item}, ${catalogItem.name}, ${catalogItem.description},
          ${catalogItem.price_value}, ${catalogItem.weight}, ${quantity}
        )
        ON CONFLICT (id_player_session, id_item)
        DO UPDATE SET quantity = player_inventory_item.quantity + EXCLUDED.quantity
        RETURNING id_inventory_item, id_player_session, id_item, name, description, price_value, weight, quantity
      `;
      return {ok: true, item};
    });
  }

  /** `null` = quantidade zerou (ou passou de zero) e a linha foi removida. */
  async adjustQuantity(
    idInventoryItem: string,
    delta: number,
  ): Promise<InventoryItem | null> {
    const [row] = await this.db.sql<InventoryItem[]>`
      UPDATE player_inventory_item
      SET quantity = quantity + ${delta}
      WHERE id_inventory_item = ${idInventoryItem}
      RETURNING id_inventory_item, id_player_session, id_item, name, description, price_value, weight, quantity
    `;
    if (!row) return null;
    if (row.quantity <= 0) {
      await this.db
        .sql`DELETE FROM player_inventory_item WHERE id_inventory_item = ${idInventoryItem}`;
      return null;
    }
    return row;
  }

  async removeItem(idInventoryItem: string): Promise<void> {
    await this.db
      .sql`DELETE FROM player_inventory_item WHERE id_inventory_item = ${idInventoryItem}`;
  }
}
