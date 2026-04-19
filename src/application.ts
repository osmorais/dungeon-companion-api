import {BootMixin} from '@loopback/boot';
import {ApplicationConfig} from '@loopback/core';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {RestApplication} from '@loopback/rest';
import path from 'path';
import {MySequence} from './sequence';
import {AiAgentService, CharacterSheetService, CharacterOptionsService} from './services';
import {PostgresDatasource} from './datasources';

export {ApplicationConfig};

export class DungeonCompanionApiApplication extends BootMixin(RestApplication) {
  constructor(options: ApplicationConfig = {}) {
    super(options);

    // Set up the custom sequence
    this.sequence(MySequence);

    // Set up default home page
    this.static('/', path.join(__dirname, '../public'));

    // Customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);

    this.service(AiAgentService, 'services.AiAgentService');
    this.service(CharacterSheetService, 'services.CharacterSheetService');
    this.service(CharacterOptionsService, 'services.CharacterOptionsService');

    this.bind('db.Postgres').toDynamicValue(() =>
      PostgresDatasource.getInstance(),
    );

    this.projectRoot = __dirname;
    // Customize @loopback/boot Booter Conventions here
    this.bootOptions = {
      controllers: {
        // Customize ControllerBooter Conventions here
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };
  }
}
