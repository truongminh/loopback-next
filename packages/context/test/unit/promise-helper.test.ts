// Copyright IBM Corp. 2013,2017. All Rights Reserved.
// Node module: @loopback/context
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import * as bluebird from 'bluebird';
import {expect} from '@loopback/testlab';
import {isPromise, RejectionError} from '../..';

describe('isPromise', () => {
  it('returns false for undefined', () => {
    expect(isPromise(undefined)).to.be.false();
  });

  it('returns false for a string value', () => {
    expect(isPromise('string-value')).to.be.false();
  });

  it('returns false for a plain object', () => {
    expect(isPromise({foo: 'bar'})).to.be.false();
  });

  it('returns false for an array', () => {
    expect(isPromise([1, 2, 3])).to.be.false();
  });

  it('returns false for a Date', () => {
    expect(isPromise(new Date())).to.be.false();
  });

  it('returns true for a native Promise', () => {
    expect(isPromise(Promise.resolve())).to.be.true();
  });

  it('returns true for a Bluebird Promise', () => {
    expect(isPromise(bluebird.resolve())).to.be.true();
  });

  it('returns false when .then() is not a function', () => {
    expect(isPromise({then: 'later'})).to.be.false();
  });
});

describe('RejectionError', () => {
  it('wraps an error', () => {
    const cause = new Error('root cause');
    const err = new RejectionError(cause);
    expect(err.message).to.eql(cause.message);
    expect(err.cause).to.exactly(cause);
    expect(err).to.be.instanceof(Error);
  });

  it('.reject() returns a rejected promise with the cause', async () => {
    const cause = new Error('root cause');
    const err = new RejectionError(cause);
    await err.reject().catch(e => expect(e).exactly(cause));
  });

  it('.catch() returns the value as is if it is not a promise', () => {
    const val = 'VALUE';
    const p = RejectionError.catch(val);
    expect(p).to.be.exactly(val);
  });

  it('.catch() returns the value if it is a promise can be resolved', async () => {
    const val = {x: 1};
    const result = await RejectionError.catch(Promise.resolve(val));
    expect(result).to.be.exactly(val);
  });

  it('.catch() returns a promise resolved with the error object', async () => {
    const cause = new Error('root cause');
    const e = await RejectionError.catch(Promise.reject(cause));
    expect(e).to.be.instanceof(RejectionError);
    expect(e.cause).to.be.exactly(cause);
  });

  it('.reject() returns the same value if it is not a promise', () => {
    const val = 'A value';
    const result = RejectionError.reject('A value');
    expect(result).to.be.exactly(val);
  });

  it(
    '.reject() returns a promise resolved to the same value for a promise ' +
      'can be resolved',
    async () => {
      const val = {x: 1};
      const result = await RejectionError.reject(Promise.resolve(val));
      expect(result).to.be.exactly(val);
    },
  );

  it(
    '.reject() returns a rejected promise with the cause for a promise ' +
      'resolved to an instance of RejectionError',
    async () => {
      const cause = new Error('root cause');
      const p = Promise.resolve(new RejectionError(cause));
      try {
        await RejectionError.reject(p);
      } catch (e) {
        expect(e).to.be.exactly(cause);
      }
    },
  );

  it('.then() processes a non-promise value as is', () => {
    const val = 'My Value';
    const fn = (v: string) => v.toUpperCase();
    const result = RejectionError.then(val, fn);
    expect(result).to.eql(val.toUpperCase());
  });

  it('.then() processes a promise if it can be resolved', async () => {
    const val = 'My Value';
    const fn = (v: string) => v.toUpperCase();
    const result = await RejectionError.then(Promise.resolve(val), fn);
    expect(result).to.eql(val.toUpperCase());
  });

  it(
    '.then() processes a promise if it is resolved to an instance of ' +
      'RejectionError',
    async () => {
      const err = new RejectionError('error');
      const fn = (v: string) => v.toUpperCase();
      const result = await RejectionError.then(Promise.resolve(err), fn);
      expect(result).to.be.exactly(err);
    },
  );
});
