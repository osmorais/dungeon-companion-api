import {ApplicationConfig, DungeonCompanionApiApplication} from './application';

export * from './application';

export async function main(options: ApplicationConfig = {}) {
  const app = new DungeonCompanionApiApplication(options);
  await app.boot();
  await app.start();

  const url = app.restServer.url;
  console.log(`Server is running at ${url}`);
  console.log(`Try ${url}/ping`);

  return app;
}

if (require.main === module) {
  // Run the application
  // CORS_ORIGIN must be the exact frontend URL (e.g. https://forjaarcana.com).
  // 'credentials: true' + 'origin: *' is rejected by browsers — never use wildcard here.
  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin) {
    console.warn(
      '[WARN] CORS_ORIGIN env var is not set. ' +
        'Set it to your frontend URL (e.g. https://forjaarcana.com) so authenticated ' +
        'cross-origin requests work. Falling back to localhost for development only.',
    );
  }

  const config = {
    rest: {
      port: +(process.env.PORT ?? 3000),
      host: process.env.HOST ?? '0.0.0.0',
      cors: {
        origin: corsOrigin ?? 'http://localhost:4200',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        allowedHeaders: 'Content-Type,Authorization',
        preflightContinue: false,
        optionsSuccessStatus: 204,
        credentials: true,
      },
      // The `gracePeriodForClose` provides a graceful close for http/https
      // servers with keep-alive clients. The default value is `Infinity`
      // (don't force-close). If you want to immediately destroy all sockets
      // upon stop, set its value to `0`.
      // See https://www.npmjs.com/package/stoppable
      gracePeriodForClose: 5000, // 5 seconds
      openApiSpec: {
        // useful when used with OpenAPI-to-GraphQL to locate your application
        setServersFromRequest: true,
      },
    },
  };
  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
