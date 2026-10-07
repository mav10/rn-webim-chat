import RNWebim, { WebimMessage } from 'rn-webim-chat';

export type ComposerAction = {
  kind: 'reply' | 'edit';
  messageId: string;
  previousDraft: string;
};

export async function submitChatText(
  text: string,
  action: ComposerAction | null,
  messages: WebimMessage[]
): Promise<void> {
  if (!text.trim()) throw new Error('Message cannot be empty.');
  if (!action) {
    await RNWebim.send(text);
    return;
  }
  const target = messages.find((message) => message.id === action.messageId);
  if (!target) throw new Error('The selected message is no longer available.');
  if (action.kind === 'reply') {
    if (!target.canReply)
      throw new Error('Replies are not allowed for this message.');
    const accepted = await RNWebim.reply(text, target);
    if (!accepted) throw new Error('The reply was not accepted by the SDK.');
    return;
  }
  if (!target.canEdit || target.type !== 'VISITOR' || target.attachment)
    throw new Error('This message can no longer be edited.');
  await RNWebim.editMessage(target.id, text);
}
