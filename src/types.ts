export type SessionBuilderParams = {
  accountName: string;
  location: string;
  accountJSON?: string;
  providedAuthorizationToken?: string;
  appVersion?: string;
  clearVisitorData?: boolean;
  storeHistoryLocally?: boolean;
  title?: string;
  pushToken?: string;
};

export enum WebimEvents {
  NEW_MESSAGE = 'newMessage',
  REMOVE_MESSAGE = 'removeMessage',
  EDIT_MESSAGE = 'changedMessage',
  CLEAR_DIALOG = 'allMessagesRemoved',
  TOKEN_UPDATED = 'tokenUpdated',
  ERROR = 'error',
  STATE = 'onlineState',
  UNREAD_COUNTER = 'unreadCount',
  TYPING = 'typing',
}

export interface WebimAttachment {
  contentType: string;
  info: string;
  name: string;
  size: number;
  url: string;
}

type MessageTypeAlias =
  | 'OPERATOR'
  | 'VISITOR'
  | 'INFO'
  | 'ACTION_REQUEST'
  | 'CONTACTS_REQUEST'
  | 'FILE_FROM_OPERATOR'
  | 'FILE_FROM_VISITOR'
  | 'OPERATOR_BUSY'
  | 'KEYBOARD'
  | 'KEYBOARD_RESPONSE';

export interface WebimMessage {
  id: string;
  serverSideId: string;
  avatar?: string;
  time: number;
  type: MessageTypeAlias;
  text: string;
  name: string;
  status: 'SENT' | 'SENDING';
  read: boolean;
  canEdit: boolean;
  carReply: boolean;
  isEdited: boolean;
  canReact: boolean;
  canChangeReaction: boolean;
  visitorReaction?: string;
  stickerId?: number;
  quote?: Quote;
  attachment?: WebimAttachment;
  operatorId?: string;
}

export type Quote = {
  authorId?: string;
  senderName: string;
  messageId: string;
  messageText: string;
  messageType: MessageTypeAlias;
  state: 'FILLED' | 'NOT_FOUND' | 'PENDING';
  timestamp: Date | number;
  attachment?: WebimAttachment;
};

export type WebimNativeError = {
  message: string;
  errorCode: string;
  errorType: 'fatal' | 'common';
};

export type NewMessageListener = (data: WebimMessage) => void;
export type UpdateMessageListener = (data: {
  from: WebimMessage;
  to: WebimMessage;
}) => void;
export type RemoveMessageListener = (data: { msg: WebimMessage }) => void;
export type DialogClearedListener = () => void;
export type TokenUpdatedListener = (token: string) => void;
export type ErrorListener = (error: WebimNativeError) => void;
export type StateListener = (state: { old: string; new: string }) => void;
export type TypingListener = (state: { isTyping: boolean }) => void;
export type UnreadCountListener = (state: number) => void;

export type WebimEventListener =
  | NewMessageListener
  | UpdateMessageListener
  | RemoveMessageListener
  | DialogClearedListener
  | TokenUpdatedListener
  | ErrorListener
  | StateListener
  | TypingListener
  | UnreadCountListener;
