import RNWebim, { WebimMessage } from 'rn-webim-chat';

export type MessageReaction = 'like' | 'dislike';

export function getMessageReaction(
  message: WebimMessage
): MessageReaction | undefined {
  const reaction = message.visitorReaction?.toLowerCase();
  return reaction === 'like' || reaction === 'dislike' ? reaction : undefined;
}

export function canSetMessageReaction(
  message: WebimMessage,
  reaction: MessageReaction
): boolean {
  const current = getMessageReaction(message);
  return current
    ? message.canChangeReaction && current !== reaction
    : message.canReact;
}

export async function submitMessageReaction(
  messageId: string,
  reaction: MessageReaction,
  messages: WebimMessage[]
): Promise<void> {
  const target = messages.find((message) => message.id === messageId);
  if (!target) throw new Error('The selected message is no longer available.');
  if (!canSetMessageReaction(target, reaction))
    throw new Error('This reaction is no longer available.');
  await RNWebim.sendReaction(target.id, reaction);
}
