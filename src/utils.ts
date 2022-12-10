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
