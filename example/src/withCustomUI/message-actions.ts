import RNWebim, { WebimMessage } from 'rn-webim-chat';
import type { AttachFileResult, SendFilesOptions } from 'rn-webim-chat';

export class AttachmentSendError extends Error {
  constructor(
    message: string,
    public stage: 'upload' | 'commit',
    public cancelled: boolean,
    private readonly retryable = stage === 'upload'
  ) {
    super(message);
    this.name = 'AttachmentSendError';
  }

  get canRetry() {
    return this.retryable;
  }
}

type ComposerSendOptions = SendFilesOptions & {
  onAttachmentSent?: (file: AttachFileResult, index: number) => void;
  onAttachmentsSent?: () => void;
};

let attachmentOperation = 0;

function checkAttachmentCancellation(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new AttachmentSendError('Remaining sends cancelled.', 'upload', true);
}

export async function submitChatAttachments(
  files: AttachFileResult[],
  options: ComposerSendOptions = {}
): Promise<{ id: string }> {
  const snapshot = files.map((file) => ({ ...file }));
  if (!snapshot.length) throw new Error('No attachments selected.');
  const operationId = `composer-${++attachmentOperation}`;
  let result: { id: string };
  for (const [index, file] of snapshot.entries()) {
    checkAttachmentCancellation(options.signal);
    options.onProgress?.({
      operationId,
      fileIndex: index,
      completedFiles: index,
      totalFiles: snapshot.length,
      phase: 'uploading',
    });
    checkAttachmentCancellation(options.signal);
    try {
      result = await RNWebim.sendFile(
        file.uri,
        file.name,
        file.mime,
        file.extension
      );
    } catch (error) {
      const details = error as { message?: string } | null;
      throw new AttachmentSendError(
        details?.message || 'The attachment send could not be confirmed.',
        'commit',
        false,
        true
      );
    }
    options.onAttachmentSent?.(file, index);
    options.onProgress?.({
      operationId,
      fileIndex: index,
      completedFiles: index + 1,
      totalFiles: snapshot.length,
      phase: index + 1 === snapshot.length ? 'sent' : 'uploading',
    });
  }
  return result!;
}

export type ComposerAction = {
  kind: 'reply' | 'edit';
  messageId: string;
  previousDraft: string;
};

export async function submitChatDraft(
  text: string,
  files: AttachFileResult[],
  action: ComposerAction | null,
  messages: WebimMessage[],
  options: ComposerSendOptions = {}
): Promise<void> {
  if (files.length && action)
    throw new Error('Attachments cannot be sent while replying or editing.');
  if (!files.length && !text.trim())
    throw new Error('Message cannot be empty.');
  if (files.length) {
    await submitChatAttachments(files, options);
    options.onAttachmentsSent?.();
    checkAttachmentCancellation(options.signal);
  }
  if (text.trim()) await submitChatText(text, action, messages);
}

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
  if (
    !target.canEdit ||
    target.type !== 'VISITOR' ||
    target.attachment ||
    target.attachments?.length
  )
    throw new Error('This message can no longer be edited.');
  await RNWebim.editMessage(target.id, text);
}

export function canRetryFailedText(message: WebimMessage): boolean {
  return (
    message.status === 'FAILED' &&
    message.type === 'VISITOR' &&
    !message.attachment &&
    !message.attachments?.length &&
    !!message.text.trim()
  );
}

export async function retryFailedText(message: WebimMessage): Promise<string> {
  if (!canRetryFailedText(message)) {
    throw new Error('Only a confirmed failed text message can be retried.');
  }
  return RNWebim.send(message.text);
}
