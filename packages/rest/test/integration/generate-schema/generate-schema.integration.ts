import {expect} from '@loopback/testlab';
import {
  getFilePaths,
  getSchemaNames,
  addModelSchema,
} from '../../../src/router/generate-schema';
import {
  OpenApiSpec,
  createEmptyApiSpec,
  DefinitionsObject,
} from '@loopback/openapi-spec';
import {resolve} from 'path';
import * as _ from 'lodash';

const pathWithOutModels = resolve(
  'dist',
  'test',
  'integration',
  'generate-schema',
  'without-models',
  'models',
);
const pathWithModels = resolve(
  'dist',
  'test',
  'integration',
  'generate-schema',
  'with-models',
  'models',
);

describe('getFilePaths and getSchemaNames', () => {
  describe('if the directory does not exist', () => {
    it('getFilePaths returns empty array with empty directory', () => {
      const badPath = 'non/existent/path/to/non/existent/models';
      const filePaths = getFilePaths(badPath);
      expect(filePaths).to.eql([]);
    });
  });
  describe('with empty directory', () => {
    it('getFilePaths returns empty array with empty directory', () => {
      const filePaths = getFilePaths(pathWithOutModels);
      expect(filePaths).to.eql([]);
    });
    it('getSchemaNames returns empty array with empty input', () => {
      const schemaNames = getSchemaNames([]);
      expect(schemaNames).to.eql([]);
    });
  });
  describe('with non-empty directory', () => {
    it('getFilePaths returns correct file paths', () => {
      const filePaths = getFilePaths(pathWithModels);
      expect(filePaths).to.containEql(
        resolve(pathWithModels, 'foo.model.d.ts'),
      );
      expect(filePaths).to.containEql(
        resolve(pathWithModels, 'bar.model.d.ts'),
      );
      // change the assertions to something more descriptive
      return filePaths;
    });
    it('getSchemaNames returns correct model names', () => {
      const filePaths = getFilePaths(pathWithModels);
      const modelNames = getSchemaNames(filePaths);
      expect(modelNames).to.containEql('Foo');
      expect(modelNames).to.containEql('Bar');
      expect(modelNames).to.not.containEql('index');
    });
  });
});
describe('generateSchema', () => {
  describe('with no models defined', () => {
    it('empty API spec remains unchanged', () => {
      const input: OpenApiSpec = createEmptyApiSpec();
      const expected: OpenApiSpec = createEmptyApiSpec();
      const result = addModelSchema(input, pathWithOutModels);
      expect(result).to.eql(expected);
    });
  });
  describe('with models defined', () => {
    it('properly generates the spec', () => {
      const input: OpenApiSpec = createEmptyApiSpec();
      let expected: OpenApiSpec = createEmptyApiSpec();
      const schemaVersion = 'http://json-schema.org/draft-04/schema#';
      expected.definitions = {
        Foo: {
          $schema: schemaVersion,
          properties: {
            fee: {
              type: 'string',
            },
            fi: {
              type: 'number',
            },
            fo: {
              items: {
                type: 'string',
              },
              type: 'array',
            },
          },
          required: ['fee', 'fo'],
          type: 'object',
        },
        Bar: {
          $schema: schemaVersion,
          properties: {
            bee: {
              type: 'string',
            },
            bi: {
              $ref: '#/definitions/Foo',
            },
            bo: {
              items: {
                $ref: '#/definitions/Foo',
              },
              type: 'array',
            },
          },
          required: ['bee', 'bi', 'bo'],
          type: 'object',
        },
      };
      addModelSchema(input, pathWithModels);
      expect(input).to.deepEqual(expected);
    });
  });
});
