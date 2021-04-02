export declare type SessionBuilderParams = {
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
export declare enum WebimEvents {
    NEW_MESSAGE = "newMessage",
    REMOVE_MESSAGE = "removeMessage",
    EDIT_MESSAGE = "changedMessage",
    CLEAR_DIALOG = "allMessagesRemoved",
    TOKEN_UPDATED = "tokenUpdated",
    ERROR = "error"
}
export interface WebimAttachment {
    contentType: string;
    info: string;
    name: string;
    size: number;
    url: string;
}
export interface WebimMessage {
    id: string;
    avatar?: string;
    time: number;
    type: 'OPERATOR' | 'VISITOR' | 'INFO';
    text: string;
    name: string;
    status: 'SENT';
    read: boolean;
    canEdit: boolean;
    attachment?: WebimAttachment;
}
export declare type NativeError = {
    message: string;
};
export declare type NewMessageListener = (data: {
    msg: WebimMessage;
}) => void;
export declare type UpdateMessageListener = (data: {
    from: WebimMessage;
    to: WebimMessage;
}) => void;
export declare type RemoveMessageListener = (data: {
    msg: WebimMessage;
}) => void;
export declare type DialogClearedListener = () => void;
export declare type TokenUpdatedListener = (token: string) => void;
export declare type ErrorListener = (error: NativeError) => void;
export declare type WebimEventListener = NewMessageListener | UpdateMessageListener | RemoveMessageListener | DialogClearedListener | TokenUpdatedListener | ErrorListener;
