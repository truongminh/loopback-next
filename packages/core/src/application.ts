// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: @loopback/core
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {Context, Binding, BindingScope, Constructor} from '@loopback/context';
import {Server} from './server';
import {Component, mountComponent} from './component';
import {CoreBindings} from './keys';
import {ExtensionPoint} from './extension-point';

/**
 * Application is the container for various types of artifacts, such as
 * components, servers, controllers, repositories, datasources, connectors,
 * and models.
 */
export class Application extends Context {
  constructor(public options?: ApplicationConfig) {
    super();
    if (!options) options = {};

    // Bind to self to allow injection of application context in other
    // modules.
    this.bind(CoreBindings.APPLICATION_INSTANCE).to(this);
    // Make options available to other modules as well.
    this.bind(CoreBindings.APPLICATION_CONFIG).to(options);

    if (options.components) {
      for (const component of options.components) {
        this.component(component);
      }
    }

    if (options.servers) {
      for (const name in options.servers) {
        this.server(options.servers[name], name);
      }
    }

    if (options.controllers) {
      for (const ctor of options.controllers) {
        this.controller(ctor);
      }
    }
  }

  /**
   * Register a controller class with this application.
   *
   * @param controllerCtor {Function} The controller class
   * (constructor function).
   * @param {string=} name Optional controller name, default to the class name
   * @return {Binding} The newly created binding, you can use the reference to
   * further modify the binding, e.g. lock the value to prevent further
   * modifications.
   *
   * ```ts
   * class MyController {
   * }
   * app.controller(MyController).lock();
   * ```
   */
  controller(controllerCtor: ControllerClass, name?: string): Binding {
    name = name || controllerCtor.name;
    return this.bind(`controllers.${name}`)
      .toClass(controllerCtor)
      .tag('controller');
  }

  /**
   * Bind a Server constructor to the Application's master context.
   * Each server constructor added in this way must provide a unique prefix
   * to prevent binding overlap.
   *
   * ```ts
   * app.server(RestServer);
   * // This server constructor will be bound under "servers.RestServer".
   * app.server(RestServer, "v1API");
   * // This server instance will be bound under "servers.v1API".
   * ```
   *
   * @param {Constructor<Server>} server The server constructor.
   * @param {string=} name Optional override for key name.
   * @returns {Binding} Binding for the server class
   * @memberof Application
   */
  public server<T extends Server>(
    ctor: Constructor<T>,
    name?: string,
  ): Binding {
    const suffix = name || ctor.name;
    const key = `${CoreBindings.SERVERS}.${suffix}`;
    return this.bind(key)
      .toClass(ctor)
      .tag('server')
      .inScope(BindingScope.SINGLETON);
  }

  /**
   * Bind an array of Server constructors to the Application's master
   * context.
   * Each server added in this way will automatically be named based on the
   * class constructor name with the "servers." prefix.
   *
   * If you wish to control the binding keys for particular server instances,
   * use the app.server function instead.
   * ```ts
   * app.servers([
   *  RestServer,
   *  GRPCServer,
   * ]);
   * // Creates a binding for "servers.RestServer" and a binding for
   * // "servers.GRPCServer";
   * ```
   *
   * @param {Constructor<Server>[]} ctors An array of Server constructors.
   * @returns {Binding[]} An array of bindings for the registered server classes
   * @memberof Application
   */
  public servers<T extends Server>(ctors: Constructor<T>[]): Binding[] {
    return ctors.map(ctor => this.server(ctor));
  }

  /**
   * Retrieve the singleton instance for a bound constructor.
   *
   * @template T
   * @param {Constructor<T>=} ctor The constructor that was used to make the
   * binding.
   * @returns {Promise<T>}
   * @memberof Application
   */
  public async getServer<T extends Server>(
    target: Constructor<T> | String,
  ): Promise<T> {
    let key: string;
    // instanceof check not reliable for string.
    if (typeof target === 'string') {
      key = `${CoreBindings.SERVERS}.${target}`;
    } else {
      const ctor = target as Constructor<T>;
      key = `servers.${ctor.name}`;
    }
    return (await this.get(key)) as T;
  }

  /**
   * Start the application, and all of its registered servers.
   *
   * @returns {Promise}
   * @memberof Application
   */
  public async start(): Promise<void> {
    await this._forEachServer(s => s.start());
  }

  /**
   * Stop the application instance and all of its registered servers.
   * @returns {Promise}
   * @memberof Application
   */
  public async stop(): Promise<void> {
    await this._forEachServer(s => s.stop());
  }

  /**
   * Helper function for iterating across all registered server components.
   * @protected
   * @template T
   * @param {(s: Server) => Promise<T>} fn The function to run against all
   * registered servers
   * @memberof Application
   */
  protected async _forEachServer<T>(fn: (s: Server) => Promise<T>) {
    const bindings = this.find(`${CoreBindings.SERVERS}.*`);
    await Promise.all(
      bindings.map(async binding => {
        const server = (await this.get(binding.key)) as Server;
        return await fn(server);
      }),
    );
  }

  /**
   * Add a component to this application and register extensions such as
   * controllers, providers, and servers from the component.
   *
   * @param componentCtor The component class to add.
   * @param {string=} name Optional component name, default to the class name
   *
   * ```ts
   *
   * export class ProductComponent {
   *   controllers = [ProductController];
   *   repositories = [ProductRepo, UserRepo];
   *   providers = {
   *     [AUTHENTICATION_STRATEGY]: AuthStrategy,
   *     [AUTHORIZATION_ROLE]: Role,
   *   };
   * };
   *
   * app.component(ProductComponent);
   * ```
   */
  public component(componentCtor: Constructor<Component>, name?: string) {
    name = name || componentCtor.name;
    const componentKey = `components.${name}`;
    this.bind(componentKey)
      .toClass(componentCtor)
      .inScope(BindingScope.SINGLETON)
      .tag('component');
    // Assuming components can be synchronously instantiated
    const instance = this.getSync(componentKey);
    mountComponent(this, instance);
  }

  /**
   * Register an extension point
   * @param extensionPointClass Extension point class
   * @param extensionPointName Name of the extension point, if not present,
   * default to extensionPoints.<extensionPoint-class-name>
   */
  public extensionPoint(
    // tslint:disable-next-line:no-any
    extensionPointClass: Constructor<ExtensionPoint<any>>,
    extensionPointName?: string,
  ): this {
    extensionPointName =
      extensionPointName || `extensionPoints.${extensionPointClass.name}`;
    this.bind(extensionPointName)
      .toClass(extensionPointClass)
      .inScope(BindingScope.SINGLETON)
      .tag('extensionPoint')
      .tag(`name:${extensionPointName}`);
    return this;
  }

  /**
   * Register an extension of the given extension point
   * @param extensionPointName Name of the extension point
   * @param extensionClass Extension class
   * @param extensionName Name of the extension. If not present, default to
   * the name of extension class
   */
  public extension(
    extensionPointName: string,
    // tslint:disable-next-line:no-any
    extensionClass: Constructor<any>,
    extensionName?: string,
  ): this {
    if (!this.isBound(extensionPointName)) {
      throw new Error(`Extension point ${extensionPointName} does not exist`);
    }
    extensionName = extensionName || extensionClass.name;
    this.bind(`${extensionPointName}.${extensionName}`)
      .toClass(extensionClass)
      .tag(`extensionPoint:${extensionPointName}`)
      .tag(`name:${extensionName}`);
    return this;
  }

  /**
   * Set configuration for an extension point
   * @param extensionPointName Name of the extension point
   * @param config Configuration object
   */
  public extensionPointConfig(
    extensionPointName: string,
    config: object,
  ): this {
    // Use a corresponding binding for the extension point config
    // Another option is to use `Binding.options()`
    this.bind(`${extensionPointName}.config`).to(config);
    return this;
  }

  /**
   * Set configuration for an extension
   * @param extensionPointName Name of the extension point
   * @param extensionName Name of the extension
   * @param config Configuration object
   */
  public extensionConfig(
    extensionPointName: string,
    extensionName: string,
    config: object,
  ): this {
    // Use a corresponding binding for the extension config
    // Another option is to use `Binding.options()`
    this.bind(`${extensionPointName}.${extensionName}.config`).to(config);
    return this;
  }

  public async getExtensionPoint(extensionPointName: string) {
    const configKey = `${extensionPointName}.config`;
    let config = {};
    if (this.isBound(configKey)) {
      config = await this.get(configKey);
    }
    const childContext = new Context(this);
    childContext.bind('config').to(config);
    return childContext.get(extensionPointName);
  }
}

/**
 * Configuration for an application
 */
export interface ApplicationConfig {
  /**
   * An array of component classes
   */
  components?: Array<Constructor<Component>>;
  /**
   * An array of controller classes
   */
  controllers?: Array<ControllerClass>;
  /**
   * A map of server name/class pairs
   */
  servers?: {
    [name: string]: Constructor<Server>;
  };
  /**
   * Other properties
   */
  // tslint:disable-next-line:no-any
  [prop: string]: any;
}

// tslint:disable-next-line:no-any
export type ControllerClass = Constructor<any>;
