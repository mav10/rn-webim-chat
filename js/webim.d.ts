import { DialogClearedListener, ErrorListener, NewMessageListener, RemoveMessageListener, SessionBuilderParams, TokenUpdatedListener, UpdateMessageListener, WebimEventListener, WebimEvents, WebimMessage } from './types';
import { WebimSubscription } from './utils';
export declare class RNWebim {
    static resumeSession(params: SessionBuilderParams): Promise<void>;
    static destroySession(clearData?: boolean): Promise<unknown>;
    static getLastMessages(limit?: number): Promise<{
        messages: WebimMessage[];
    }>;
    static getNextMessages(limit?: number): Promise<{
        messages: WebimMessage[];
    }>;
    static getAllMessages(): Promise<{
        messages: WebimMessage[];
    }>;
    static send(message: string): Promise<unknown>;
    static rateOperator(rate: number): Promise<unknown>;
    static tryAttachFile(): Promise<unknown>;
    static sendFile(uri: string, name: string, mime: string, extension: string): Promise<unknown>;
    static addNewMessageListener(listener: NewMessageListener): WebimSubscription;
    static addRemoveMessageListener(listener: RemoveMessageListener): WebimSubscription;
    static addEditMessageListener(listener: UpdateMessageListener): WebimSubscription;
    static addDialogClearedListener(listener: DialogClearedListener): WebimSubscription;
    static addTokenUpdatedListener(listener: TokenUpdatedListener): WebimSubscription;
    static addErrorListener(listener: ErrorListener): WebimSubscription;
    static addListener(event: WebimEvents, listener: WebimEventListener): WebimSubscription;
    static removeListener(event: WebimEvents, listener: WebimEventListener): void;
    static removeAllListeners(event: WebimEvents): void;
}
export default RNWebim;
