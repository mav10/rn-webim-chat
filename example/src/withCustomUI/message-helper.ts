import type { IChatMessage, User } from 'react-native-gifted-chat';
import type { Quote, WebimMessage } from 'rn-webim-chat';

export type WebimWithReplyMessage = IChatMessage & { quote?: Quote };

export function mapWebimToChatMessage(
  msg: WebimMessage
): WebimWithReplyMessage {
  const mappedUser: User = {
    _id: msg.operatorId || 'custom_id',
    name: msg.name,
    avatar: msg.avatar,
  };

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
    quote: msg.quote,
  } as WebimWithReplyMessage;
}
