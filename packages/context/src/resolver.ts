// Copyright IBM Corp. 2013,2017. All Rights Reserved.
// Node module: @loopback/context
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {Context} from './context';
import {Binding, BoundValue, ValueOrPromise} from './binding';
import {isPromise} from './promise-helper';
import {
  describeInjectedArguments,
  describeInjectedProperties,
  Injection,
} from './inject';
import {RejectionError} from './promise-helper';

import * as assert from 'assert';

/**
 * A class constructor accepting arbitrary arguments.
 */
export type Constructor<T> =
  // tslint:disable-next-line:no-any
  new (...args: any[]) => T;

/**
 * Object to keep states for a session to resolve bindings and their
 * dependencies within a context
 */
export class ResolutionSession {
  /**
   * A stack of bindings for the current resolution session. It's used to track
   * the path of dependency resolution and detect circular dependencies.
   */
  readonly bindings: Binding[] = [];

  /**
   * Start to resolve a binding within the session
   * @param binding Binding
   * @param session Resolution session
   */
  static enterBinding(
    binding: Binding,
    session?: ResolutionSession,
  ): ResolutionSession {
    session = session || new ResolutionSession();
    session.enter(binding);
    return session;
  }

  /**
   * Getter for the current binding
   */
  get binding() {
    return this.bindings[this.bindings.length - 1];
  }

  /**
   * Enter the resolution of the given binding. If
   * @param binding Binding
   */
  enter(binding: Binding) {
    if (this.bindings.indexOf(binding) !== -1) {
      throw new Error(
        `Circular dependency detected for '${
          binding.key
        }' on path '${this.getBindingPath()}'`,
      );
    }
    this.bindings.push(binding);
  }

  /**
   * Exit the resolution of a binding
   */
  exit() {
    return this.bindings.pop();
  }

  /**
   * Get the binding path as `bindingA->bindingB->bindingC`.
   */
  getBindingPath() {
    return this.bindings.map(b => b.key).join('->');
  }
}

/**
 * Create an instance of a class which constructor has arguments
 * decorated with `@inject`.
 *
 * The function returns a class when all dependencies were
 * resolved synchronously, or a Promise otherwise.
 *
 * @param ctor The class constructor to call.
 * @param ctx The context containing values for `@inject` resolution
 * @param session Optional session for binding and dependency resolution
 * @param nonInjectedArgs Optional array of args for non-injected parameters
 */
export function instantiateClass<T>(
  ctor: Constructor<T>,
  ctx: Context,
  session?: ResolutionSession,
  nonInjectedArgs?: BoundValue[],
): T | Promise<T | RejectionError> {
  session = session || new ResolutionSession();
  const argsOrPromise = resolveInjectedArguments(ctor, '', ctx, session);
  const propertiesOrPromise = resolveInjectedProperties(ctor, ctx, session);

  // Apply constructor arguments
  let instOrPromise = RejectionError.then<BoundValue[], T>(
    argsOrPromise,
    args => new ctor(...args),
  );
  instOrPromise = RejectionError.then<T, T>(instOrPromise, inst =>
    // Apply properties to the instance
    RejectionError.then<KV, T>(
      propertiesOrPromise,
      props => <T>Object.assign(inst, props),
    ),
  );
  return instOrPromise;
}

/**
 * Resolve the value or promise for a given injection
 * @param ctx Context
 * @param injection Descriptor of the injection
 * @param session Optional session for binding and dependency resolution
 */
function resolve<T>(
  ctx: Context,
  injection: Injection,
  session?: ResolutionSession,
): ValueOrPromise<T> {
  if (injection.resolve) {
    // A custom resolve function is provided
    return injection.resolve(ctx, injection, session);
  }
  // Default to resolve the value from the context by binding key
  return ctx.getValueOrPromise(injection.bindingKey, session);
}

/**
 * Given a function with arguments decorated with `@inject`,
 * return the list of arguments resolved using the values
 * bound in `ctx`.

 * The function returns an argument array when all dependencies were
 * resolved synchronously, or a Promise otherwise.
 *
 * @param target The class for constructor injection or prototype for method
 * injection
 * @param method The method name. If set to '', the constructor will
 * be used.
 * @param ctx The context containing values for `@inject` resolution
 * @param session Optional session for binding and dependency resolution
 * @param nonInjectedArgs Optional array of args for non-injected parameters
 */
export function resolveInjectedArguments(
  // tslint:disable-next-line:no-any
  target: any,
  method: string,
  ctx: Context,
  session?: ResolutionSession,
  nonInjectedArgs?: BoundValue[],
): BoundValue[] | Promise<BoundValue[]> {
  if (method) {
    assert(typeof target[method] === 'function', `Method ${method} not found`);
  }
  // NOTE: the array may be sparse, i.e.
  //   Object.keys(injectedArgs).length !== injectedArgs.length
  // Example value:
  //   [ , 'key1', , 'key2']
  const injectedArgs = describeInjectedArguments(target, method);
  nonInjectedArgs = nonInjectedArgs || [];

  const argLength = method ? target[method].length : target.length;
  const args: BoundValue[] = new Array(argLength);
  let asyncResolvers: Promise<BoundValue | RejectionError>[] = [];

  let nonInjectedIndex = 0;

  // A closure to set an argument by index
  const argSetter = (i: number) => (val: BoundValue) =>
    val instanceof RejectionError ? val : (args[i] = val);

  for (let ix = 0; ix < argLength; ix++) {
    let injection = ix < injectedArgs.length ? injectedArgs[ix] : undefined;
    if (injection == null || (!injection.bindingKey && !injection.resolve)) {
      const name = method || target.name;
      if (nonInjectedIndex < nonInjectedArgs.length) {
        // Set the argument from the non-injected list
        args[ix] = nonInjectedArgs[nonInjectedIndex++];
        continue;
      } else {
        throw new Error(
          `Cannot resolve injected arguments for function ${name}: ` +
            `The arguments[${ix}] is not decorated for dependency injection, ` +
            `but a value is not supplied`,
        );
      }
    }

    const valueOrPromise = RejectionError.catch<BoundValue[]>(
      resolve(ctx, injection, session),
    );
    if (isPromise(valueOrPromise)) {
      asyncResolvers.push(valueOrPromise.then(argSetter(ix)));
    } else {
      args[ix] = valueOrPromise;
    }
  }

  if (asyncResolvers.length) {
    return Promise.all(asyncResolvers).then(
      vals => vals.find(v => v instanceof RejectionError) || args,
    );
  } else {
    return args;
  }
}

/**
 * Invoke an instance method with dependency injection
 * @param target Target of the method, it will be the class for a static
 * method, and instance or class prototype for a prototype method
 * @param method Name of the method
 * @param ctx Context
 * @param nonInjectedArgs Optional array of args for non-injected parameters
 */
export function invokeMethod(
  // tslint:disable-next-line:no-any
  target: any,
  method: string,
  ctx: Context,
  nonInjectedArgs?: BoundValue[],
): BoundValue | Promise<BoundValue | RejectionError> {
  const argsOrPromise = resolveInjectedArguments(
    target,
    method,
    ctx,
    undefined,
    nonInjectedArgs,
  );
  assert(typeof target[method] === 'function', `Method ${method} not found`);
  return RejectionError.then<BoundValue[], BoundValue>(argsOrPromise, args =>
    target[method](...args),
  );
}

export type KV = {[p: string]: BoundValue};

/**
 * Given a class with properties decorated with `@inject`,
 * return the map of properties resolved using the values
 * bound in `ctx`.

 * The function returns an argument array when all dependencies were
 * resolved synchronously, or a Promise otherwise.
 *
 * @param constructor The class for which properties should be resolved.
 * @param ctx The context containing values for `@inject` resolution
 * @param session Optional session for binding and dependency resolution
 */
export function resolveInjectedProperties(
  constructor: Function,
  ctx: Context,
  session?: ResolutionSession,
): KV | Promise<KV> {
  const injectedProperties = describeInjectedProperties(constructor.prototype);

  const properties: KV = {};
  let asyncResolvers: Promise<BoundValue | RejectionError>[] = [];

  const propertyResolver = (p: string) => (v: BoundValue) =>
    v instanceof RejectionError ? v : (properties[p] = v);

  for (const p in injectedProperties) {
    let injection = injectedProperties[p];
    if (!injection.bindingKey && !injection.resolve) {
      throw new Error(
        `Cannot resolve injected property for class ${constructor.name}: ` +
          `The property ${p} was not decorated for dependency injection.`,
      );
    }

    const valueOrPromise = RejectionError.catch<KV>(
      resolve(ctx, injection, session),
    );
    if (isPromise(valueOrPromise)) {
      asyncResolvers.push(valueOrPromise.then(propertyResolver(p)));
    } else {
      properties[p] = valueOrPromise;
    }
  }

  if (asyncResolvers.length) {
    return Promise.all(asyncResolvers).then(
      vals => vals.find(v => v instanceof RejectionError) || properties,
    );
  } else {
    return properties;
  }
}
