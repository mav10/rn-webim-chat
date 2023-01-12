import {
  EmitterSubscription,
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';
import type {
  DialogClearedListener,
  ErrorListener,
  FileUploadingListener,
  NewMessageListener,
  Operator,
  RemoveMessageListener,
  SessionBuilderParams,
  StateListener,
  TokenUpdatedListener,
  TypingListener,
  UnreadCountListener,
  UpdateMessageListener,
  WebimEventListener,
  WebimMessage,
  WebimNativeError,
} from './types';
import { WebimEvents } from './types';
import { webimErrorHandler, WebimSubscription } from './utils';

const LINKING_ERROR =
  `The package 'rn-webim-chat' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const RnWebimChat = NativeModules.RnWebimChat
  ? NativeModules.RnWebimChat
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

const emitter = new NativeEventEmitter(RnWebimChat);

const DEFAULT_MESSAGES_LIMIT = 100;

export class RNWebim {
  static initSession(params: SessionBuilderParams): Promise<void> {
    return RnWebimChat.initSession(params)
      .catch(webimErrorHandler)
      .then(() => {
        return;
      });
  }

  static resumeSession(): Promise<void> {
    return RnWebimChat.resumeSession()
      .catch(webimErrorHandler)
      .then(() => {
        return;
      });
  }

  static pauseSession(): Promise<void> {
    return RnWebimChat.pauseSession();
  }

  static destroySession(clearData: boolean = false) {
    return RnWebimChat.destroySession(clearData)
      .catch(webimErrorHandler)
      .then(() => {
        return;
      });
  }

  static getLastMessages(
    limit: number = DEFAULT_MESSAGES_LIMIT
  ): Promise<WebimMessage[]> {
    return RnWebimChat.getLastMessages(limit)
      .catch(webimErrorHandler)
      .then((messages: WebimMessage[]) => {
        return messages || [];
      });
  }

  static getNextMessages(
    limit: number = DEFAULT_MESSAGES_LIMIT
  ): Promise<WebimMessage[]> {
    return RnWebimChat.getNextMessages(limit)
      .catch(webimErrorHandler)
      .then((messages: WebimMessage[]) => {
        return messages || [];
      });
  }

  static getAllMessages(): Promise<WebimMessage[]> {
    return RnWebimChat.getAllMessages()
      .catch(webimErrorHandler)
      .then((messages: WebimMessage[]) => {
        return messages || [];
      });
  }

  static send(message: string): Promise<string> {
    return RnWebimChat.send(message)
      .catch(webimErrorHandler)
      .then((id: string) => {
        return id;
      });
  }

  static readMessages(): Promise<void> {
    return RnWebimChat.readMessages()
      .catch(webimErrorHandler)
      .then(() => {
        return;
      });
  }

  static rateOperator(rate: number) {
    return RnWebimChat.rateOperator(rate)
      .catch(webimErrorHandler)
      .then(() => {
        return;
      });
  }

  static getCurrentOperator(): Promise<Operator> {
    return RnWebimChat.getCurrentOperator()
      .catch(webimErrorHandler)
      .then((result: Operator) => {
        return result;
      });
  }

  static tryAttachFile(): Promise<{ id: string }> {
    return new Promise((resolve, reject) => {
      RnWebimChat.tryAttachFile(
        (error: WebimNativeError) => reject(webimErrorHandler(error, false)),
        async (file: {
          uri: string;
          name: string;
          mime: string;
          extension: string;
        }) => {
          const { uri, name, mime, extension } = file;
          try {
            const result = (await RNWebim.sendFile(
              uri,
              name,
              mime,
              extension
            )) as { id: string };
            resolve(result);
          } catch (e: any) {
            reject(webimErrorHandler(e, false));
          }
        }
      );
    });
  }

  static sendFile(uri: string, name: string, mime: string, extension: string) {
    return new Promise((resolve, reject) =>
      RnWebimChat.sendFile(uri, name, mime, extension, reject, resolve)
    );
  }

  public static addTypingListener(listener: TypingListener): WebimSubscription {
    const subscription = emitter.addListener(WebimEvents.TYPING, listener);
    return new WebimSubscription(() => RNWebim.removeListener(subscription));
  }

  public static addFileUploadingListener(
    listener: FileUploadingListener
  ): WebimSubscription {
    const subscription = emitter.addListener(
      WebimEvents.FILE_UPLOADING_PROGRESS,
      listener
    );
    return new WebimSubscription(() => RNWebim.removeListener(subscription));
  }

  public static addUnreadCountListener(
    listener: UnreadCountListener
  ): WebimSubscription {
    const subscription = emitter.addListener(
      WebimEvents.UNREAD_COUNTER,
      listener
    );
    return new WebimSubscription(() => RNWebim.removeListener(subscription));
  }

  public static addNewMessageListener(
    listener: NewMessageListener
  ): WebimSubscription {
    const subscription = emitter.addListener(WebimEvents.NEW_MESSAGE, listener);
    return new WebimSubscription(() => RNWebim.removeListener(subscription));
  }

  public static addRemoveMessageListener(
    listener: RemoveMessageListener
  ): WebimSubscription {
    const subscription = emitter.addListener(
      WebimEvents.REMOVE_MESSAGE,
      listener
    );
    return new WebimSubscription(() => RNWebim.removeListener(subscription));
  }

  public static addEditMessageListener(
    listener: UpdateMessageListener
  ): WebimSubscription {
    const subscription = emitter.addListener(
      WebimEvents.EDIT_MESSAGE,
      listener
    );
    return new WebimSubscription(() => RNWebim.removeListener(subscription));
  }

  public static addDialogClearedListener(
    listener: DialogClearedListener
  ): WebimSubscription {
    const subscription = emitter.addListener(
      WebimEvents.CLEAR_DIALOG,
      listener
    );
    return new WebimSubscription(() => RNWebim.removeListener(subscription));
  }

  public static addTokenUpdatedListener(
    listener: TokenUpdatedListener
  ): WebimSubscription {
    const subscription = emitter.addListener(
      WebimEvents.TOKEN_UPDATED,
      listener
    );
    return new WebimSubscription(() => RNWebim.removeListener(subscription));
  }

  public static addErrorListener(listener: ErrorListener): WebimSubscription {
    const subscription = emitter.addListener(WebimEvents.ERROR, listener);
    return new WebimSubscription(() => RNWebim.removeListener(subscription));
  }

  public static addSateListener(listener: StateListener): WebimSubscription {
    const subscription = emitter.addListener(WebimEvents.STATE, listener);
    return new WebimSubscription(() => RNWebim.removeListener(subscription));
  }

  public static addListener(
    event: WebimEvents,
    listener: WebimEventListener
  ): WebimSubscription {
    const subscription = emitter.addListener(event, listener);
    return new WebimSubscription(() => RNWebim.removeListener(subscription));
  }

  public static removeListener(listener: EmitterSubscription): void {
    emitter.removeSubscription(listener);
  }

  static removeAllListeners(event: WebimEvents) {
    emitter.removeAllListeners(event);
  }
}

export * from './types';
export * from './utils';
export default RNWebim;
