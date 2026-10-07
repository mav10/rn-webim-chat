import type {
  IChatMessage,
  IMessage,
  Reply,
  User,
} from 'react-native-gifted-chat';
import type { WebimMessage } from 'rn-webim-chat';

export type ChatMessage = IChatMessage & {
  attachmentUrl?: string;
  quote?: WebimMessage['quote'];
  webimMessage: WebimMessage;
};

export function mapWebimToChatMessage(msg: WebimMessage): ChatMessage {
  const attachment = msg.attachment;
  const isImage = attachment?.contentType.startsWith('image/') ?? false;
  const isVideo = attachment?.contentType.startsWith('video/') ?? false;
  const mappedUser: User = {
    _id: msg.operatorId || 'custom_id',
    name: msg.name,
    avatar: msg.avatar,
  };

  console.log(
    'MappedUser: ',
    mappedUser,
    {
      _id: msg.name,
      name: msg.name,
      avatar: msg.avatar,
    },
    msg
  );

  const keyboardButtons =
    msg.type === 'KEYBOARD' && msg.keyboard?.state === 'PENDING'
      ? msg.keyboard.buttons.flat().map((button) => ({
          title: button.text,
          value: button.id,
        }))
      : [];

  return {
    _id: msg.id,
    quote: msg.quote,
    webimMessage: msg,
    text: attachment ? (isImage || isVideo ? '' : attachment.name) : msg.text,
    createdAt: msg.time,
    sent: msg.status === 'SENT',
    pending: msg.status === 'SENDING',
    received: msg.read,
    image: isImage ? attachment?.url : undefined,
    video: isVideo ? attachment?.url : undefined,
    attachmentUrl:
      attachment && !isImage && !isVideo ? attachment.url : undefined,
    user: mappedUser,
    system:
      msg.type !== 'OPERATOR' &&
      msg.type !== 'VISITOR' &&
      msg.type !== 'FILE_FROM_OPERATOR' &&
      msg.type !== 'FILE_FROM_VISITOR',
    quickReplies:
      keyboardButtons.length > 0
        ? {
            type: 'radio',
            values: keyboardButtons as Reply[],
            keepIt: false,
          }
        : undefined,
  } as IMessage & ChatMessage;
}
