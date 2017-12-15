import {
  convertToSchemaObject,
  addModelSchema,
  getFilePaths,
  getSchemaNames,
} from '../../../src/router/generate-schema';
import {expect} from '@loopback/testlab';
import {Definition} from 'typescript-json-schema';
import {
  SchemaObject,
  createEmptyApiSpec,
  OpenApiSpec,
} from '@loopback/openapi-spec';
import {resolve} from 'path';

describe('convertToSchemaObject', () => {
  describe('valid', () => {
    it('does nothing when given an empty object', () => {
      expect({}).to.eql({});
    });
    const typeDef = {type: ['string', 'number']};
    const expectedType = {type: 'string'};
    propertyConversionTest('type', typeDef, expectedType);

    const allOfDef: Definition = {
      // type: 'object',
      allOf: [typeDef, typeDef],
    };
    const expectedAllOf: SchemaObject = {
      // type: 'object',
      allOf: [expectedType, expectedType],
    };
    propertyConversionTest('allOf', allOfDef, expectedAllOf);

    const propertyDef: Definition = {
      type: 'object',
      properties: {
        foo: typeDef,
      },
    };

    const expectedProperties: SchemaObject = {
      type: 'object',
      properties: {
        foo: expectedType,
      },
    };
    propertyConversionTest('properties', propertyDef, expectedProperties);

    const additionalDef: Definition = {
      type: 'object',
      additionalProperties: typeDef,
    };
    const expectedAdditional: SchemaObject = {
      type: 'object',
      additionalProperties: expectedType,
    };
    propertyConversionTest(
      'additionalProperties',
      additionalDef,
      expectedAdditional,
    );

    const itemsDef: Definition = {
      type: 'array',
      items: typeDef,
    };
    const expectedItems: SchemaObject = {
      type: 'array',
      items: expectedType,
    };
    propertyConversionTest('items', itemsDef, expectedItems);

    it('retains given properties in the conversion', () => {
      const inputDef: Definition = {
        title: 'foo',
        type: 'object',
      };
      const expectedDef: SchemaObject = {
        title: 'foo',
        type: 'object',
      };
      expect(convertToSchemaObject(inputDef)).to.eql(expectedDef);
    });
  });
  describe('invalid path', () => {
    it('throws if type is an array and items is missing', () => {
      expect.throws(
        () => {
          convertToSchemaObject({type: 'array'});
        },
        Error,
        '"items" property must be present if "type" is an array',
      );
    });
  });

  // Helper function to check conversion of JSON Schema properties
  // to Swagger versions
  function propertyConversionTest(
    name: string,
    property: Object,
    expected: Object,
  ) {
    it(name, () => {
      expect(convertToSchemaObject(property)).to.eql(expected);
    });
  }
});
