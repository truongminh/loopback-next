// Copyright IBM Corp. 2013,2017. All Rights Reserved.
// Node module: @loopback/boot
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {statSync, readdirSync} from 'fs';
import {join} from 'path';
import {Application} from '@loopback/core';

export interface readOptions {
  dir: string;
  recursive: boolean;
  includeExts?: string[];
  excludeExts?: string[];
}

export function getFilesInFolder(opts: readOptions) {
  const defaultOptions = {
    recursive: true,
    includeExts: [],
  };

  opts = Object.assign({}, defaultOptions, opts);
  const files = readFolder(opts.dir, opts.recursive);
  console.log('******************');
  console.log(files);
  console.log('******************');
}

// tslint:disable-next-line:no-any
export function readFolder(d: string, recursive: boolean): any {
  return recursive
    ? statSync(d).isDirectory()
      ? readdirSync(d).map((f) => readFolder(join(d, f), recursive))
      : // tslint:disable-next-line:no-unused-expression
        d
    : readdirSync(d);
}

// tslint:disable-next-line:no-any
export function flatten(arr: string[]): any {
  return arr.reduce(
    (flat, item) => flat.concat(Array.isArray(item) ? flatten(item) : item),
    [],
  );
}

export function filterExts(arr: string[], exts: string[]) {
  if (exts && exts.length === 0) return arr;
  return arr.filter((item) => {
    let include = false;
    exts.forEach((ext) => {
      if (item.indexOf(ext) === item.length - ext.length) {
        include = true;
      }
    });

    if (include) return item;
  });
}

// export function bootArtifact(
//   d: string,
//   prefix: string,
//   app: Application,
//   filter: string[] = [],
// ) {
//   const files = filterExts(flatten(readFolder(d, true)), filter);
//   console.log('~~~~~~~~~~~~~~~~~~');
//   console.log(files);
//   console.log('~~~~~~~~~~~~~~~~~~');

//   files.forEach((file) => {
//     const ctrl = require(file);
//     const classes = Object.keys(ctrl);

//     classes.forEach((cls: string) => {
//       console.log(ctrl[cls]);
//       app.bind(`${prefix}.${cls}`).toClass(ctrl[cls]).tag(prefix);
//     });
//   });
// }
