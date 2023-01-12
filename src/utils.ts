import type { WebimNativeError } from './types';

export function parseNativeResponse<T>(response?: T): T | null {
  return response || null;
}

export function isWebimError(err: any): err is WebimNativeError {
  const errorFields = Object.keys(err);
  return errorFields.includes('errorCode') && errorFields.includes('errorType');
}

export function processError(error: WebimNativeError) {
  return new Error(error.errorCode);
}

export class WebimSubscription {
  readonly remove: () => void;

  constructor(remove: () => void) {
    this.remove = remove;
  }
}

/**
 * Parse error object, map it into {@link WebimNativeError} and decide should be thrown or not.
 *
 * @param {*} err - A caught error-object on Promise-level.
 * @param {boolean} [throwable=true] - Optional parameter to define throw immediately
 * or take error result and handle by your-self.
 *
 * @return {WebimNativeError} In case of not throwable.
 *
 * @throws {WebimNativeError}
 */
export function webimErrorHandler(
  err: any,
  throwable: boolean = true
): WebimNativeError {
  const errorBody: WebimNativeError = {
    errorCode: err?.errorCode || 'UNKNWON',
    message: err?.message || 'Unexpected error',
    errorType: err?.errorType || 'common',
  };

  if (throwable) {
    throw errorBody;
  }

  return errorBody;
}
