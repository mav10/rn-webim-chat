import {
  EmitterSubscription,
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';
import type {
  AttachFileResult,
  AttachFilesOptions,
  DialogClearedListener,
  ErrorListener,
  FileUploadingListener,
  NewMessageListener,
  Operator,
  RemoveMessageListener,
  SessionBuilderParams,
  SendFilesOptions,
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
import { sendAttachmentGroup, validateAttachmentLimit } from './attachments';

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

type WebimNativeEventMap = {
  [WebimEvents.NEW_MESSAGE]: Parameters<NewMessageListener>;
  [WebimEvents.REMOVE_MESSAGE]: Parameters<RemoveMessageListener>;
  [WebimEvents.EDIT_MESSAGE]: Parameters<UpdateMessageListener>;
  [WebimEvents.CLEAR_DIALOG]: Parameters<DialogClearedListener>;
  [WebimEvents.TOKEN_UPDATED]: Parameters<TokenUpdatedListener>;
  [WebimEvents.ERROR]: Parameters<ErrorListener>;
  [WebimEvents.STATE]: Parameters<StateListener>;
  [WebimEvents.UNREAD_COUNTER]: Parameters<UnreadCountListener>;
  [WebimEvents.TYPING]: Parameters<TypingListener>;
  [WebimEvents.FILE_UPLOADING_PROGRESS]: Parameters<FileUploadingListener>;
};

const emitter = new NativeEventEmitter<WebimNativeEventMap>(RnWebimChat);

const DEFAULT_MESSAGES_LIMIT = 100;

export class RNWebim {
  static setVisitorTyping(draft: string | null): Promise<void> {
    if (typeof RnWebimChat.setVisitorTyping !== 'function') {
      return Promise.reject(new Error('NATIVE_TYPING_UPDATE_REQUIRED'));
    }
    return RnWebimChat.setVisitorTyping(draft)
      .catch(webimErrorHandler)
      .then(() => undefined);
  }

  static resolveAttachmentUrl(
    messageId: string,
    index: number,
    fallback: string
  ): Promise<string> {
    if (Platform.OS !== 'android') return Promise.resolve(fallback);
    if (typeof RnWebimChat.resolveAttachmentUrl !== 'function') {
      return Promise.reject(new Error('NATIVE_MEDIA_UPDATE_REQUIRED'));
    }
    return RnWebimChat.resolveAttachmentUrl(messageId, index).catch(
      webimErrorHandler
    );
  }

  static setPushToken(token: string): Promise<void> {
    if (typeof token !== 'string' || !token.trim()) {
      return Promise.reject({
        errorCode: 'INVALID_PUSH_TOKEN',
        message: 'Push token must not be empty',
        errorType: 'common',
      });
    }
    return RnWebimChat.setPushToken(token)
      .catch(webimErrorHandler)
      .then(() => undefined);
  }

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

  static reply(message: string, replyTo: WebimMessage): Promise<boolean> {
    return RnWebimChat.reply(message, replyTo.id)
      .catch(webimErrorHandler)
      .then((accepted: boolean) => accepted);
  }

  static sendSticker(stickerId: number): Promise<void> {
    return RnWebimChat.sendSticker(stickerId)
      .catch(webimErrorHandler)
      .then(() => undefined);
  }

  static editMessage(messageId: string, text: string): Promise<void> {
    return RnWebimChat.editMessage(messageId, text)
      .catch(webimErrorHandler)
      .then(() => undefined);
  }

  static deleteMessage(messageId: string): Promise<void> {
    return RnWebimChat.deleteMessage(messageId)
      .catch(webimErrorHandler)
      .then(() => undefined);
  }

  static sendReaction(
    messageId: string,
    reaction: 'like' | 'dislike'
  ): Promise<void> {
    return RnWebimChat.sendReaction(messageId, reaction)
      .catch(webimErrorHandler)
      .then(() => undefined);
  }

  static sendKeyboardResponse(
    messageId: string,
    buttonId: string
  ): Promise<string> {
    return RnWebimChat.sendKeyboardResponse(messageId, buttonId)
      .catch(webimErrorHandler)
      .then((responseMessageId: string) => responseMessageId);
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

  static tryAttachFile(): Promise<AttachFileResult> {
    return new Promise((resolve, reject) => {
      RnWebimChat.tryAttachFile(
        (error: WebimNativeError) => reject(webimErrorHandler(error, false)),
        (result: AttachFileResult) => resolve(result)
      );
    });
  }

  static async tryAttachFiles(
    options: AttachFilesOptions = {}
  ): Promise<AttachFileResult[]> {
    const maxFiles = validateAttachmentLimit(options.maxFiles);
    return RnWebimChat.tryAttachFiles({
      kind: options.kind ?? 'documents',
      maxFiles,
    }).catch(webimErrorHandler);
  }

  static uploadFile(file: AttachFileResult): Promise<string> {
    return RnWebimChat.uploadFile(
      file.uri,
      file.name,
      file.mime,
      file.extension
    ).catch(webimErrorHandler);
  }

  static sendUploadedFiles(handles: string[]): Promise<{ id: string }> {
    if (!Array.isArray(handles) || handles.length < 1 || handles.length > 10) {
      return Promise.reject({
        errorCode: 'INVALID_FILES_COUNT',
        message: 'Select between 1 and 10 files',
        errorType: 'common',
      });
    }
    return RnWebimChat.sendUploadedFiles(handles).catch(webimErrorHandler);
  }

  static deleteUploadedFile(handle: string): Promise<void> {
    return RnWebimChat.deleteUploadedFile(handle)
      .catch(webimErrorHandler)
      .then(() => undefined);
  }

  static sendFiles(
    files: AttachFileResult[],
    options: SendFilesOptions = {}
  ): Promise<{ id: string }> {
    return sendAttachmentGroup(RNWebim, files, options);
  }

  static async tryAttachAndSendFiles(
    options: AttachFilesOptions & SendFilesOptions = {}
  ): Promise<{ id: string }> {
    const files = await RNWebim.tryAttachFiles(options);
    return RNWebim.sendFiles(files, options);
  }

  static sendFile(
    uri: string,
    name: string,
    mime: string,
    extension: string
  ): Promise<{ id: string }> {
    return new Promise((resolve, reject) =>
      RnWebimChat.sendFile(
        uri,
        name,
        mime,
        extension,
        (error: WebimNativeError) => reject(webimErrorHandler(error, false)),
        (result: { id: string }) => resolve(result)
      )
    );
  }

  static tryAttachAndSendFile(): Promise<{ id: string }> {
    return new Promise((resolve, reject) => {
      RnWebimChat.tryAttachFile(
        (error: WebimNativeError) => reject(webimErrorHandler(error, false)),
        async (file: AttachFileResult) => {
          const { uri, name, mime, extension } = file;
          try {
            const result = await RNWebim.sendFile(uri, name, mime, extension);
            resolve(result);
          } catch (e: any) {
            reject(webimErrorHandler(e, false));
          }
        }
      );
    });
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
    const subscription = emitter.addListener(
      event,
      listener as (...args: WebimNativeEventMap[typeof event]) => void
    );
    return new WebimSubscription(() => RNWebim.removeListener(subscription));
  }

  public static removeListener(listener: EmitterSubscription): void {
    listener.remove();
  }

  static removeAllListeners(event: WebimEvents) {
    emitter.removeAllListeners(event);
  }
}

export * from './types';
export * from './utils';
export * from './webimNativeError';
export * from './notifications';
export default RNWebim;
