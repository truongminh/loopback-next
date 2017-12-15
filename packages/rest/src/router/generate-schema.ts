import * as TJS from 'typescript-json-schema';
import * as _ from 'lodash';
import {resolve} from 'path';
import {OpenApiSpec, SchemaObject, MapObject} from '@loopback/openapi-spec';
import {existsSync} from 'fs';

const readdirSync = require('readdir-enhanced').readdirSync;

export function addModelSchema(
  spec: OpenApiSpec,
  modelPath: string,
): OpenApiSpec {
  const paths = getFilePaths(modelPath);
  const schemaNames = getSchemaNames(paths);

  if (schemaNames.length) {
    const settings: TJS.PartialArgs = {
      required: true,
      excludePrivate: true,
    };

    const compilerOptions: TJS.CompilerOptions = {
      strictNullChecks: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    };

    const program = TJS.getProgramFromFiles(paths, compilerOptions);
    const generator = TJS.buildGenerator(program, settings);
    if (!spec.definitions) {
      spec.definitions = {};
    }
    if (generator) {
      for (const name of schemaNames) {
        const schemaObject = generator.getSchemaForSymbol(name);
        spec.definitions[name] = convertToSchemaObject(schemaObject);
        delete spec.definitions[name].definitions;
      }
    }
  }
  return spec;
}

export function getFilePaths(modelPath: string): string[] {
  if (!existsSync(modelPath)) {
    return [];
  }
  return _(readdirSync(modelPath, {basePath: modelPath}))
    .values<string>()
    .filter((p: string) => {
      return p.endsWith('.ts');
    })
    .value();
}

export function getSchemaNames(paths: string[]) {
  return _(paths)
    .map(p => {
      // Get last part of path
      const fileName = p.substring(p.lastIndexOf('/') + 1, p.length - 1);
      // Get first part of the name
      const name = fileName.substring(0, fileName.indexOf('.'));
      // Ignore any index files (since they're used to export the whole folder)
      const isEq = _.isEqual(name, 'index');
      return isEq ? '' : _.capitalize(name);
    })
    .compact()
    .value();
}

// converts TJS.Definition into Swagger's SchemaObjecty
export function convertToSchemaObject(input: TJS.Definition): SchemaObject {
  const emptySchemaObj: SchemaObject = {};
  // tslint:disable-next-line:no-any
  const def: {[key: string]: any} = input;
  for (const property in def) {
    const val = def[property];
    switch (property) {
      // converts excepted properties to SchemaObject definitions
      case 'type': {
        if (def.type === 'array' && !def.items) {
          throw new Error(
            '"items" property must be present if "type" is an array',
          );
        }
        emptySchemaObj.type = Array.isArray(input.type)
          ? input.type[0]
          : input.type;
        break;
      }
      case 'allOf': {
        const collector: SchemaObject[] = [];
        for (const item of def.allOf) {
          collector.push(convertToSchemaObject(item));
        }
        emptySchemaObj.allOf = collector;
        break;
      }
      case 'properties': {
        // tslint:disable-next-line:no-any
        const properties: {[key: string]: any} = def.properties;
        const collector: MapObject<SchemaObject> = {};
        for (const item in properties) {
          collector[item] = convertToSchemaObject(properties[item]);
        }
        emptySchemaObj.properties = collector;
        break;
      }
      case 'additionalProperties': {
        if (input.additionalProperties) {
          if (input.additionalProperties === true) {
            emptySchemaObj.additionalProperties = {};
          } else {
            emptySchemaObj.additionalProperties = convertToSchemaObject(
              input.additionalProperties,
            );
          }
        }
        break;
      }
      case 'items': {
        def.items = Array.isArray(def.items) ? def.items[0] : def.items;
        emptySchemaObj.items = convertToSchemaObject(def.items);
        break;
      }
      default: {
        emptySchemaObj[property] = val;
        break;
      }
    }
  }

  return <SchemaObject>emptySchemaObj;
}

// Could be replaced by some config elements.
export const mPath = resolve('dist', 'src', 'models');
