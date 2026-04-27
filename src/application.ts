import {BootMixin} from '@loopback/boot';
import {ApplicationConfig} from '@loopback/core';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {RepositoryMixin} from '@loopback/repository'; 
import {ServiceMixin} from '@loopback/service-proxy'; 
import {RestApplication} from '@loopback/rest';
import path from 'path';
import {MySequence} from './sequence';
import {AiAgentService, CharacterSheetService, CharacterOptionsService} from './services';
import {CharacterOptionsRepository} from './repositories/character-options.repository';
import {CharacterRepository} from './repositories/character.repository';
import {PostgresDatasource} from './datasources';

export {ApplicationConfig};

// ADICIONE RepositoryMixin e ServiceMixin aqui:
export class DungeonCompanionApiApplication extends BootMixin(
  ServiceMixin(RepositoryMixin(RestApplication)),
) {
  constructor(options: ApplicationConfig = {}) {
    super(options);

    this.sequence(MySequence);

    this.static('/', path.join(__dirname, '../public'));

    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);

    this.service(AiAgentService, 'services.AiAgentService');
    this.repository(CharacterRepository); 
    this.service(CharacterSheetService, 'services.CharacterSheetService');
    this.repository(CharacterOptionsRepository);
    this.service(CharacterOptionsService, 'services.CharacterOptionsService');

    this.bind('db.Postgres').toDynamicValue(() =>
      PostgresDatasource.getInstance(),
    );

    this.projectRoot = __dirname;
    
    this.bootOptions = {
      controllers: {
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
      repositories: {
        dirs: ['repositories'],
        extensions: ['.repository.js'],
        nested: true,
      },
      services: {
        dirs: ['services'],
        extensions: ['.service.js'],
        nested: true,
      },
    };
  }
}