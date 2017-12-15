import {Application, ControllerClass} from '@loopback/core';
import {
  RestComponent,
  RestServer,
  post,
  param,
  RestBindings,
} from '../../../index';
import {anOpenApiSpec, anOperationSpec} from '@loopback/openapi-spec-builder';
import {createClientForHandler, Client} from '@loopback/testlab';
import {Foo} from './models/foo.model';
import {resolve} from 'path';
import {inspect} from 'util';

describe('Schema definition', () => {
  it('is correctly referenced by controller spec', async () => {
    const testApp = givenAnApplication();
    const testServer = await givenAServer(testApp);

    class MyController {
      @post('/ping')
      @param.body('name', Foo)
      greet(name: string) {}
    }
    const path = resolve(
      'dist',
      'test',
      'acceptance',
      'schema',
      'src',
      'models',
    );
    const spec = anOpenApiSpec()
      .withOperation(
        'post',
        '/ping',
        anOperationSpec()
          .withParameter({
            name: 'name',
            in: 'body',
            schema: {
              $ref: '#/definitions/Foo',
            },
          })
          .withExtension('x-operation-name', 'greet')
          .withExtension('x-controller-name', 'MyController'),
      )
      .build();
    spec.definitions = {
      Foo: {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        properties: {bar: {type: 'string'}},
        required: ['bar'],
      },
    };

    givenControllerInApp(testApp, MyController);
    const modelPath = resolve('test', 'acceptance', 'schema', 'models');
    testServer.bind(RestBindings.MODEL_PATH).to(modelPath);
    await testApp.start();
    await whenIMakeRequestTo(testServer)
      .get('/swagger.json')
      .send()
      .expect(200, spec);
  });
  function givenAnApplication() {
    return new Application({
      components: [RestComponent],
    });
  }
  async function givenAServer(app: Application) {
    return await app.getServer(RestServer);
  }
  function givenControllerInApp(app: Application, controller: ControllerClass) {
    app.controller(controller);
  }

  function whenIMakeRequestTo(server: RestServer): Client {
    return createClientForHandler(server.handleHttp);
  }
});
