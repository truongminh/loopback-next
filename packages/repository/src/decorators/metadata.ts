import {InspectionOptions, MetadataInspector} from '@loopback/context';
import {MODEL_KEY, MODEL_PROPERTIES_KEY} from '../';
import {ModelDefinition, PropertyDefinition} from '../../index';
import * as _ from 'lodash';

export class ModelMetadataHelper {
  /**
   * A utility function to simplify retrieving metadata from a target model and
   * its properties.
   * @param target The class from which to retrieve metadata.
   * @param options An options object for the MetadataInspector to customize
   * the output of the metadata retrieval functions.
   */
  static getModelMetadata(target: Function, options?: InspectionOptions) {
    const classDef = MetadataInspector.getClassMetadata(
      MODEL_KEY,
      target,
      options,
    );
    const meta = new ModelDefinition(
      Object.assign(
        {
          name: target.name,
        },
        classDef,
      ),
    );
    if (_.isEmpty(_.keys(meta.properties))) {
      meta.properties = Object.assign(
        <PropertyDefinition>{},
        MetadataInspector.getAllPropertyMetadata(
          MODEL_PROPERTIES_KEY,
          target.prototype,
          options,
        ),
      );
      MetadataInspector.defineMetadata(MODEL_KEY, meta, target);
    }
    return meta;
  }
}
