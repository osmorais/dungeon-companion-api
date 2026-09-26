/* eslint-disable @typescript-eslint/naming-convention */

/** Linha crua do catálogo de itens (tabela `item`) — dado de referência, sem dono. */
export interface ItemCatalogEntry {
  id_item: number;
  name: string;
  description: string | null;
  price_value: number | null;
  weight: number | null;
}

/**
 * Item no inventário de um jogador numa sessão — único por sessão+jogador (`player_session`
 * já identifica os dois juntos). Guarda uma cópia (nome/descrição/preço/peso) do catálogo no
 * momento em que foi adicionado, mesma lógica de `MonsterSession.data_snapshot`: editar o
 * catálogo depois não muda retroativamente o que já está na mochila de alguém.
 */
export interface InventoryItem {
  id_inventory_item: string;
  id_player_session: string;
  id_item: number;
  name: string;
  description: string | null;
  price_value: number | null;
  weight: number | null;
  quantity: number;
}

/** `quantity` ausente = 1. Adicionar um item já existente soma na quantidade (upsert).
 *  `debit_currency`: se true, desconta preço×quantidade do PO do personagem antes de adicionar
 *  — falha (sem adicionar nada) se o personagem não tiver PO suficiente. */
export interface AddInventoryItemInput {
  id_item: number;
  quantity?: number;
  debit_currency?: boolean;
}
