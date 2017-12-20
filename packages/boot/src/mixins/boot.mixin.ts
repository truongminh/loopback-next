// Copyright IBM Corp. 2013,2017. All Rights Reserved.
// Node module: @loopback/boot
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {Constructor} from '@loopback/context';
import {filterExts, flatten, readFolder} from '../helpers';
import {join} from 'path';

/**
 * A mixin class for Application that boots it. Boot automatically
 * binds controllers based on convention based naming before starting
 * the Application.
 * 
 * ```ts
 * class MyApp extends BootMixin(Application) {}
 * ```
 */
// tslint:disable-next-line:no-any
export function BootMixin<T extends Constructor<any>>(superClass: T) {
  return class extends superClass {
    // tslint:disable-next-line:no-any
    constructor(...args: any[]) {
      super(...args);
      if (!this.options) this.options = {};
      if (!this.options.bootOptions) {
        // this.bootOptions = {
        //   rootDir = join(process.cwd(), 'dist'),
        // };
        this.options.bootOptions = {};
      }

      // Call Boot Here!!
    }

    async start() {
      // call boot here
      console.log('start =>', __dirname);
      console.log(__filename);
      console.log(process.cwd());
      // console.log(process.pwd());
      await this.bootArtifact(join(__dirname, 'controllers'), 'controller', [
        'controller.js',
      ]);
      super.start();
    }

    bootArtifact(d: string, prefix: string, filter: string[] = []) {
      const files = filterExts(flatten(readFolder(d, true)), filter);
      console.log('~~~~~~~~~~~~~~~~~~');
      console.log(files);
      console.log('~~~~~~~~~~~~~~~~~~');

      files.forEach((file) => {
        const ctrl = require(file);
        const classes = Object.keys(ctrl);

        classes.forEach((cls: string) => {
          console.log(ctrl[cls]);
          this.bind(`${prefix}.${cls}`).toClass(ctrl[cls]).tag(prefix);
        });
      });
    }
  };
}
