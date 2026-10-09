import type { WebimMessage } from 'rn-webim-chat';

export function findQuotedMessageIndex(
  messages: WebimMessage[],
  messageId: string
): number {
  if (!messageId) return -1;
  return messages.findIndex(
    (message) => message.id === messageId || message.serverSideId === messageId
  );
}
