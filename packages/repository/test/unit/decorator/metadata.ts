import {ModelMetadataHelper} from '../../../src';
import {property, model, ModelDefinition, MODEL_KEY} from '../../..';
import {expect} from '@loopback/testlab';
import {MetadataInspector} from '@loopback/context';

describe('Repository', () => {
  describe('getAllClassMetadata', () => {
    @model()
    class Colour {
      @property({})
      rgb: string;
    }
    @model()
    class Widget {
      @property() id: number;
      @property.array(Colour) colours: Colour[];
    }

    @model()
    class Samoflange {
      id: number;
      name: string;
      canRotate: boolean;
    }

    @model()
    class Phlange {
      @property() id: number;
      @property() canFlap: boolean;
      @property.array(Colour) colours: Colour[];
    }

    it('retrieves metadata for classes with @model', () => {
      const meta = ModelMetadataHelper.getModelMetadata(Samoflange);
      expect(meta).to.deepEqual(
        new ModelDefinition({
          name: 'Samoflange',
          properties: {},
          settings: new Map(),
        }),
      );
    });

    it('retrieves metadata for classes with @model and @property', () => {
      const meta = ModelMetadataHelper.getModelMetadata(Widget);
      expect(meta).to.deepEqual(
        new ModelDefinition({
          properties: {
            id: {
              type: Number,
            },
            colours: {
              array: true,
              type: Colour,
            },
          },
          settings: new Map(),
          name: 'Widget',
        }),
      );
    });

    it('returns existing properties instead of re-assembling them', () => {
      const classMeta = MetadataInspector.getClassMetadata(
        MODEL_KEY,
        Phlange,
      ) as ModelDefinition;
      classMeta.properties = {
        foo: {
          type: String,
        },
      };
      const meta = ModelMetadataHelper.getModelMetadata(Phlange);
      expect(meta.properties).to.eql(classMeta.properties);
    });
  });
});
