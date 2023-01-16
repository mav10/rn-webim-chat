import type {
  IChatMessage,
  IMessage,
  Reply,
  User,
} from 'react-native-gifted-chat';
import type { WebimMessage } from 'rn-webim-chat';

export function mapWebimToChatMessage(msg: WebimMessage): IChatMessage {
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

  return {
    _id: msg.serverSideId || msg.id,
    text: msg.attachment?.url ? '' : msg.text,
    createdAt: msg.time,
    sent: msg.status === 'SENT',
    pending: msg.status === 'SENDING',
    received: msg.read,
    image: msg.attachment?.contentType.includes('image')
      ? msg.attachment?.url
      : '',
    user: mappedUser,
    system:
      msg.type !== 'OPERATOR' &&
      msg.type !== 'VISITOR' &&
      msg.type !== 'FILE_FROM_OPERATOR' &&
      msg.type !== 'FILE_FROM_VISITOR',
    quickReplies: msg?.quote
      ? [
          {
            type: 'radio' as 'radio',
            values: [
              {
                messageId: msg.quote.messageId,
                value: msg.quote.messageText,
                title: msg.quote.senderName,
              } as Reply,
            ],
            keepIt: true,
          },
        ]
      : undefined,
  } as IMessage;
}
