import { NativeError } from './types';
export declare function parseNativeResponse<T>(response?: T): T | null;
export declare function processError(error: NativeError): Error;
export declare class WebimSubscription {
    readonly remove: () => void;
    constructor(remove: () => void);
}
