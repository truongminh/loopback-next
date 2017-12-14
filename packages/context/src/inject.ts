// Copyright IBM Corp. 2013,2017. All Rights Reserved.
// Node module: @loopback/context
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {
  MetadataInspector,
  ParameterDecoratorFactory,
  PropertyDecoratorFactory,
  MetadataMap,
} from '@loopback/metadata';
import {Binding, BoundValue, ValueOrPromise} from './binding';
import {Context} from './context';
import {isPromise} from './is-promise';
import {ResolutionSession} from './resolver';

const PARAMETERS_KEY = 'inject:parameters';
const PROPERTIES_KEY = 'inject:properties';

/**
 * A function to provide resolution of injected values
 */
export interface ResolverFunction {
  (
    ctx: Context,
    injection: Injection,
    session?: ResolutionSession,
  ): ValueOrPromise<BoundValue>;
}

/**
 * Descriptor for an injection point
 */
export interface Injection {
  bindingKey: string; // Binding key
  metadata?: {[attribute: string]: BoundValue}; // Related metadata
  resolve?: ResolverFunction; // A custom resolve function
}

/**
 * A decorator to annotate method arguments for automatic injection
 * by LoopBack IoC container.
 *
 * Usage - Typescript:
 *
 * ```ts
 * class InfoController {
 *   @inject('authentication.user') public userName: string;
 *
 *   constructor(@inject('application.name') public appName: string) {
 *   }
 *   // ...
 * }
 * ```
 *
 * Usage - JavaScript:
 *
 *  - TODO(bajtos)
 *
 * @param bindingKey What binding to use in order to resolve the value of the
 * decorated constructor parameter or property.
 * @param metadata Optional metadata to help the injection
 * @param resolve Optional function to resolve the injection
 *
 */
export function inject(
  bindingKey: string,
  metadata?: Object,
  resolve?: ResolverFunction,
) {
  return function markParameterOrPropertyAsInjected(
    // tslint:disable-next-line:no-any
    target: any,
    propertyKey: string | symbol,
    methodDescriptorOrParameterIndex?:
      | TypedPropertyDescriptor<BoundValue>
      | number,
  ) {
    if (typeof methodDescriptorOrParameterIndex === 'number') {
      // The decorator is applied to a method parameter
      // Please note propertyKey is `undefined` for constructor
      const paramDecorator: ParameterDecorator = ParameterDecoratorFactory.createDecorator(
        PARAMETERS_KEY,
        {
          bindingKey,
          metadata,
          resolve,
        },
      );
      paramDecorator(target, propertyKey!, methodDescriptorOrParameterIndex);
    } else if (propertyKey) {
      // Property or method
      if (typeof Object.getPrototypeOf(target) === 'function') {
        const prop = target.name + '.' + propertyKey.toString();
        throw new Error(
          '@inject is not supported for a static property: ' + prop,
        );
      }
      if (methodDescriptorOrParameterIndex) {
        // Method
        throw new Error(
          '@inject cannot be used on a method: ' + propertyKey.toString(),
        );
      }
      const propDecorator: PropertyDecorator = PropertyDecoratorFactory.createDecorator(
        PROPERTIES_KEY,
        {
          bindingKey,
          metadata,
          resolve,
        },
      );
      propDecorator(target, propertyKey!);
    } else {
      // It won't happen here as `@inject` is not compatible with ClassDecorator
      /* istanbul ignore next */
      throw new Error(
        '@inject can only be used on a property or a method parameter',
      );
    }
  };
}

/**
 * The function injected by `@inject.getter(key)`.
 */
export type Getter<T> = () => Promise<T>;

/**
 * The function injected by `@inject.setter(key)`.
 */
export type Setter<T> = (value: T) => void;

export namespace inject {
  /**
   * Inject a function for getting the actual bound value.
   *
   * This is useful when implementing Actions, where
   * the action is instantiated for Sequence constructor, but some
   * of action's dependencies become bound only after other actions
   * have been executed by the sequence.
   *
   * See also `Getter<T>`.
   *
   * @param bindingKey The key of the value we want to eventually get.
   * @param metadata Optional metadata to help the injection
   */
  export const getter = function injectGetter(
    bindingKey: string,
    metadata?: Object,
  ) {
    return inject(bindingKey, metadata, resolveAsGetter);
  };

  /**
   * Inject a function for setting (binding) the given key to a given
   * value. (Only static/constant values are supported, it's not possible
   * to bind a key to a class or a provider.)
   *
   * This is useful e.g. when implementing Actions that are contributing
   * new Elements.
   *
   * See also `Setter<T>`.
   *
   * @param bindingKey The key of the value we want to set.
   * @param metadata Optional metadata to help the injection
   */
  export const setter = function injectSetter(
    bindingKey: string,
    metadata?: Object,
  ) {
    return inject(bindingKey, metadata, resolveAsSetter);
  };

  /**
   * Inject an option from `options` of the parent binding. If no corresponding
   * option value is present, `undefined` will be injected.
   *
   * @example
   * ```ts
   * class Store {
   *   constructor(
   *     @inject.options('x') public optionX: number,
   *     @inject.options('y') public optionY: string,
   *   ) { }
   * }
   *
   * ctx.bind('store1').toClass(Store).withOptions({ x: 1, y: 'a' });
   * ctx.bind('store2').toClass(Store).withOptions({ x: 2, y: 'b' });
   *
   *  const store1 = ctx.getSync('store1');
   *  expect(store1.optionX).to.eql(1);
   *  expect(store1.optionY).to.eql('a');

   * const store2 = ctx.getSync('store2');
   * expect(store2.optionX).to.eql(2);
   * expect(store2.optionY).to.eql('b');
   * ```
   *
   * @param bindingKey Optional property path of the option. If is `''` or not
   * present, the `options` object will be returned.
   * @param metadata Optional metadata to help the injection
   */
  export const options = function injectOptions(
    bindingKey?: string,
    metadata?: Object,
  ) {
    return inject(bindingKey || '', metadata, resolveAsOptions);
  };
}

function resolveAsGetter(ctx: Context, injection: Injection) {
  // No resolution session should be propagated into the getter
  return function getter() {
    return ctx.get(injection.bindingKey);
  };
}

function resolveAsSetter(ctx: Context, injection: Injection) {
  // No resolution session should be propagated into the setter
  return function setter(value: BoundValue) {
    ctx.bind(injection.bindingKey).to(value);
  };
}

function resolveAsOptions(
  ctx: Context,
  injection: Injection,
  session?: ResolutionSession,
) {
  if (!(session && session.binding)) {
    // The injection does not happen within a binding. For example,
    // instantiateClass(cls, ctx) is used.
    return undefined;
  }

  let path = injection.bindingKey;
  if (path.startsWith('#')) {
    // Remove leading `#`
    path = path.substring(1);
  }
  path = path.replace(/#/g, '.');

  let boundValue = session.binding.options;
  if (isPromise(boundValue)) {
    return boundValue.then(v => Binding.getDeepProperty(v, path));
  }
  return Binding.getDeepProperty(boundValue, path);
}

/**
 * Return an array of injection objects for parameters
 * @param target The target class for constructor or static methods,
 * or the prototype for instance methods
 * @param method Method name, undefined for constructor
 */
export function describeInjectedArguments(
  // tslint:disable-next-line:no-any
  target: any,
  method?: string | symbol,
): Injection[] {
  method = method || '';
  const meta = MetadataInspector.getAllParameterMetadata<Injection>(
    PARAMETERS_KEY,
    target,
    method,
  );
  return meta || [];
}

/**
 * Return a map of injection objects for properties
 * @param target The target class for static properties or
 * prototype for instance properties.
 */
export function describeInjectedProperties(
  // tslint:disable-next-line:no-any
  target: any,
): MetadataMap<Injection> {
  const metadata =
    MetadataInspector.getAllPropertyMetadata<Injection>(
      PROPERTIES_KEY,
      target,
    ) || {};
  return metadata;
}
