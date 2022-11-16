import {
  EmitterSubscription,
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';
import type {
  DialogClearedListener,
  ErrorListener,
  NativeError,
  NewMessageListener,
  RemoveMessageListener,
  SessionBuilderParams,
  TokenUpdatedListener,
  UpdateMessageListener,
  WebimEventListener,
  WebimMessage,
} from './types';
import { WebimEvents } from './types';
import { processError, WebimSubscription } from './utils';

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
  static resumeSession(params: SessionBuilderParams): Promise<void> {
    return new Promise((resolve, reject) => {
      RnWebimChat.resumeSession(
        params,
        (error: NativeError) => reject(processError(error)),
        () => resolve()
      );
    });
  }

  static destroySession(clearData: boolean = false) {
    return new Promise((resolve, reject) => {
      RnWebimChat.destroySession(
        clearData,
        (error: NativeError) => reject(processError(error)),
        resolve
      );
    });
  }

  static getLastMessages(
    limit: number = DEFAULT_MESSAGES_LIMIT
  ): Promise<{ messages: WebimMessage[] }> {
    return new Promise((resolve, reject) => {
      RnWebimChat.getLastMessages(
        limit,
        (error: NativeError) => reject(processError(error)),
        (messages: { messages: WebimMessage[] }) => resolve(messages)
      );
    });
  }

  static getNextMessages(
    limit: number = DEFAULT_MESSAGES_LIMIT
  ): Promise<{ messages: WebimMessage[] }> {
    return new Promise((resolve, reject) => {
      RnWebimChat.getNextMessages(
        limit,
        (error: NativeError) => reject(processError(error)),
        (messages: { messages: WebimMessage[] }) => resolve(messages)
      );
    });
  }

  static getAllMessages(): Promise<{ messages: WebimMessage[] }> {
    return new Promise((resolve, reject) => {
      RnWebimChat.getAllMessages(
        (error: NativeError) => reject(processError(error)),
        (messages: { messages: WebimMessage[] }) => resolve(messages)
      );
    });
  }

  static send(message: string) {
    return new Promise((resolve, reject) =>
      RnWebimChat.send(
        message,
        (error: NativeError) => reject(processError(error)),
        (id: string) => resolve(id)
      )
    );
  }

  static rateOperator(rate: number) {
    return new Promise((resolve, reject) => {
      RnWebimChat.rateOperator(
        rate,
        (error: NativeError) => reject(processError(error)),
        resolve
      );
    });
  }

  static tryAttachFile() {
    return new Promise((resolve, reject) => {
      RnWebimChat.tryAttachFile(
        (error: NativeError) => reject(processError(error)),
        async (file: {
          uri: string;
          name: string;
          mime: string;
          extension: string;
        }) => {
          const { uri, name, mime, extension } = file;
          try {
            await RNWebim.sendFile(uri, name, mime, extension);
            resolve;
          } catch (e: any) {
            reject(processError(e));
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
