// Copyright IBM Corp. 2013,2017. All Rights Reserved.
// Node module: @loopback/context
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {BoundValue, ValueOrPromise} from './binding';

/**
 * Check whether a value is a Promise-like instance.
 * Recognizes both native promises and third-party promise libraries.
 *
 * @param value The value to check.
 */
export function isPromise<T>(
  value: T | PromiseLike<T>,
): value is PromiseLike<T> {
  if (!value) return false;
  if (typeof value !== 'object' && typeof value !== 'function') return false;
  return typeof (value as PromiseLike<T>).then === 'function';
}

/**
 * A type for a value of `T`, or a promise of `T | RejectionError`.
 */
export type ValueOrPromiseWithError<T> = T | Promise<T | RejectionError>;

/**
 * A special Error to wrap a rejected promise or another Error. It allows us
 * to propagate errors gracefully through the promise/async/await chain without
 * UnhandledPromiseRejectionWarning.
 */
export class RejectionError extends Error {
  cause: BoundValue;
  constructor(cause: BoundValue) {
    let message = undefined;
    if (cause instanceof Error) {
      message = cause.message;
    }
    super(message);
    this.cause = cause;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RejectionError);
    }
  }

  /**
   * Return a promise that rejects with the root cause
   */
  reject() {
    return Promise.reject(this.cause);
  }

  /**
   * Catch a potentially rejected promise and convert it to a promise resolved
   * to an instance of RejectionError to propagate the root cause
   */
  static catch<T>(p: ValueOrPromise<T>): ValueOrPromiseWithError<T> {
    if (p instanceof Promise) {
      return p.catch(e => new RejectionError(e));
    }
    return p;
  }

  /**
   * Reject a promise if it produces an instance of RejectionError. The cause
   * of the RejectionError instance will be used as the reason of rejection.
   */
  static reject<T>(val: ValueOrPromiseWithError<T>): ValueOrPromise<T> {
    if (isPromise(val)) {
      return val.then(
        // Reject the promise if it resolves to an instance of RejectionError
        // tslint:disable-next-line:await-promise
        async v => (v instanceof RejectionError ? v.reject() : await v),
      );
    } else {
      // Return the normal value (not rejected)
      return val;
    }
  }

  /**
   * Set up a `onFulfilled` function for the promise
   * @param val A value or promise that can be either resolved to the value or
   * an error
   * @param onFulfilled A callback function called if the Promise is fulfilled
   */
  static then<T, V>(
    val: ValueOrPromiseWithError<T>,
    onFulfilled: (v: T) => ValueOrPromiseWithError<V>,
  ): ValueOrPromiseWithError<V> {
    if (isPromise(val)) {
      return val.then(
        // Either resolve an instance of RejectionError
        async v => (v instanceof RejectionError ? v : await onFulfilled(v)),
      );
    } else {
      // Not a promise, call the onFulfilled function directly
      return onFulfilled(val);
    }
  }
}
