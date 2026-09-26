/* eslint-disable @typescript-eslint/naming-convention */
import {inject} from '@loopback/core';
import {
  del,
  get,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {PlayerInventoryService} from '../services/player-inventory.service';
import {
  AddInventoryItemInput,
  InventoryItem,
  ItemCatalogEntry,
} from '../models/player-inventory-types';

@authenticate('jwt')
export class PlayerInventoryController {
  constructor(
    @inject('services.PlayerInventoryService')
    private playerInventoryService: PlayerInventoryService,
  ) {}

  @get('/api/item')
  @response(200, {
    description:
      'Returns the full item catalog (reference data, not owned by anyone)',
    content: {
      'application/json': {schema: {type: 'array', items: {type: 'object'}}},
    },
  })
  async listItemCatalog(): Promise<ItemCatalogEntry[]> {
    return this.playerInventoryService.getItemCatalog();
  }

  @get('/api/player-session/{id}/inventory')
  @response(200, {
    description: "Returns a player's session inventory",
    content: {
      'application/json': {schema: {type: 'array', items: {type: 'object'}}},
    },
  })
  async getInventory(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<InventoryItem[]> {
    return this.playerInventoryService.getInventory(id, currentUser.id);
  }

  @post('/api/player-session/{id}/inventory')
  @response(200, {
    description:
      "Adds an item to a player's session inventory (stacks quantity if already present)",
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async addItem(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'Item to add',
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    body: AddInventoryItemInput,
  ): Promise<InventoryItem> {
    return this.playerInventoryService.addItem(id, currentUser.id, body);
  }

  @patch('/api/player-inventory-item/{id}/quantity')
  @response(200, {
    description:
      "Adjusts an inventory item's quantity — null if it hit zero and was removed",
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async adjustQuantity(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'Quantity delta (positive or negative)',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['delta'],
            properties: {delta: {type: 'integer'}},
          },
        },
      },
    })
    body: {delta: number},
  ): Promise<InventoryItem | null> {
    return this.playerInventoryService.adjustQuantity(
      id,
      currentUser.id,
      body.delta,
    );
  }

  @del('/api/player-inventory-item/{id}')
  @response(204, {description: 'Removes an inventory item entirely'})
  async removeItem(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<void> {
    return this.playerInventoryService.removeItem(id, currentUser.id);
  }
}
