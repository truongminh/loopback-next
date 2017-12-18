// Copyright IBM Corp. 2013,2017. All Rights Reserved.
// Node module: @loopback/context
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {Context} from './context';
import {Binding, BoundValue, ValueOrPromise} from './binding';
import {isPromise, ValueOrPromiseWithError} from './promise-helper';
import {
  describeInjectedArguments,
  describeInjectedProperties,
  Injection,
} from './inject';
import {RejectionError} from './promise-helper';

import * as assert from 'assert';
import * as debugModule from 'debug';
import {DecoratorFactory} from '@loopback/metadata';

const debug = debugModule('loopback:context:resolver');

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

  readonly injections: Injection[] = [];

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
   * Push an injection into the session
   * @param injection Injection
   * @param session Resolution session
   */
  static enterInjection(
    injection: Injection,
    session?: ResolutionSession,
  ): ResolutionSession {
    session = session || new ResolutionSession();
    session.enterInjection(injection);
    return session;
  }

  private describeInjection(injection?: Injection) {
    if (injection == null) return injection;
    const name = DecoratorFactory.getTargetName(
      injection.target,
      injection.member,
      injection.methodDescriptorOrParameterIndex,
    );
    return {
      targetName: name,
      bindingKey: injection.bindingKey,
      metadata: injection.metadata,
    };
  }

  /**
   * Push the injection onto the session
   * @param injection Injection
   */
  enterInjection(injection: Injection) {
    if (debug.enabled) {
      debug('Enter injection:', this.describeInjection(injection));
    }
    this.injections.push(injection);
    if (debug.enabled) {
      debug('Injection path:', this.getInjectionPath());
    }
  }

  /**
   * Pop the last injection
   */
  exitInjection() {
    const injection = this.injections.pop();
    if (debug.enabled) {
      debug('Exit injection:', this.describeInjection(injection));
      debug('Injection path:', this.getInjectionPath() || '<empty>');
    }
    return injection;
  }

  /**
   * Getter for the current binding
   */
  get injection() {
    return this.injections[this.injections.length - 1];
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
    if (debug.enabled) {
      debug('Enter binding:', binding.toJSON());
    }
    if (this.bindings.indexOf(binding) !== -1) {
      throw new Error(
        `Circular dependency detected for '${
          binding.key
        }' on path '${this.getBindingPath()}'`,
      );
    }
    this.bindings.push(binding);
    if (debug.enabled) {
      debug('Binding path:', this.getBindingPath());
    }
  }

  /**
   * Exit the resolution of a binding
   */
  exit() {
    const binding = this.bindings.pop();
    if (debug.enabled) {
      debug('Exit binding:', binding && binding.toJSON());
      debug('Binding path:', this.getBindingPath() || '<empty>');
    }
    return binding;
  }

  /**
   * Get the binding path as `bindingA->bindingB->bindingC`.
   */
  getBindingPath() {
    return this.bindings.map(b => b.key).join('->');
  }

  /**
   * Get the injection path as `injectionA->injectionB->injectionC`.
   */
  getInjectionPath() {
    return this.injections
      .map(i => this.describeInjection(i)!.targetName)
      .join('->');
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
): ValueOrPromiseWithError<T> {
  let resolved: ValueOrPromise<T>;
  let result: ValueOrPromiseWithError<T>;
  // Push the injection onto the session
  session = ResolutionSession.enterInjection(injection, session);
  if (injection.resolve) {
    // A custom resolve function is provided
    resolved = injection.resolve(ctx, injection, session);
  } else {
    // Default to resolve the value from the context by binding key
    resolved = ctx.getValueOrPromise(injection.bindingKey, session);
  }
  if (isPromise(resolved)) {
    result = RejectionError.catch<T>(resolved);
    result = RejectionError.then<T, T>(result, r => {
      session!.exitInjection();
      return r;
    });
  } else {
    result = resolved;
    session.exitInjection();
  }
  return result;
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
  target: Object,
  method: string,
  ctx: Context,
  session?: ResolutionSession,
  nonInjectedArgs?: BoundValue[],
): BoundValue[] | Promise<BoundValue[]> {
  const targetWithMethods = <{[method: string]: Function}>target;
  if (method) {
    assert(
      typeof targetWithMethods[method] === 'function',
      `Method ${method} not found`,
    );
  }
  // NOTE: the array may be sparse, i.e.
  //   Object.keys(injectedArgs).length !== injectedArgs.length
  // Example value:
  //   [ , 'key1', , 'key2']
  const injectedArgs = describeInjectedArguments(target, method);
  nonInjectedArgs = nonInjectedArgs || [];

  const argLength = DecoratorFactory.getNumberOfParameters(target, method);
  const args: BoundValue[] = new Array(argLength);
  let asyncResolvers: Promise<BoundValue | RejectionError>[] = [];

  let nonInjectedIndex = 0;

  // A closure to set an argument by index
  const argSetter = (i: number) => (val: BoundValue) =>
    val instanceof RejectionError ? val : (args[i] = val);

  for (let ix = 0; ix < argLength; ix++) {
    let injection = ix < injectedArgs.length ? injectedArgs[ix] : undefined;
    if (injection == null || (!injection.bindingKey && !injection.resolve)) {
      if (nonInjectedIndex < nonInjectedArgs.length) {
        // Set the argument from the non-injected list
        args[ix] = nonInjectedArgs[nonInjectedIndex++];
        continue;
      } else {
        const name = DecoratorFactory.getTargetName(target, method, ix);
        throw new Error(
          `Cannot resolve injected arguments for ${name}: ` +
            `The arguments[${ix}] is not decorated for dependency injection, ` +
            `but a value is not supplied`,
        );
      }
    }

    const valueOrPromise = resolve(ctx, injection, session);
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
  target: Object,
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
  const targetWithMethods = <{[method: string]: Function}>target;
  assert(
    typeof targetWithMethods[method] === 'function',
    `Method ${method} not found`,
  );
  return RejectionError.then<BoundValue[], BoundValue>(argsOrPromise, args =>
    targetWithMethods[method](...args),
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

    const valueOrPromise = resolve(ctx, injection, session);
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
