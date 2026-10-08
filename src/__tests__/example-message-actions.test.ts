jest.mock(
  'rn-webim-chat',
  () => ({
    __esModule: true,
    default: { send: jest.fn(), reply: jest.fn(), editMessage: jest.fn() },
  }),
  { virtual: true }
);

import RNWebim from 'rn-webim-chat';
import type { WebimMessage } from '../types';
import {
  canRetryFailedText,
  retryFailedText,
  submitChatText,
} from '../../example/src/withCustomUI/message-actions';

const native = RNWebim as jest.Mocked<typeof RNWebim>;
const message = {
  id: 'visitor-1',
  type: 'VISITOR',
  text: 'Original',
  canEdit: true,
  canReply: true,
} as WebimMessage;
const action = { messageId: message.id, previousDraft: 'Draft' };

beforeEach(() => {
  jest.resetAllMocks();
  native.reply.mockResolvedValue(true);
});

it('sends ordinary messages without invoking reply or edit', async () => {
  await submitChatText('Hello', null, []);
  expect(native.send).toHaveBeenCalledWith('Hello');
  expect(native.reply).not.toHaveBeenCalled();
  expect(native.editMessage).not.toHaveBeenCalled();
});

it('replies using the current source message and never sends a duplicate', async () => {
  await submitChatText('Reply', { ...action, kind: 'reply' }, [message]);
  expect(native.reply).toHaveBeenCalledWith('Reply', message);
  expect(native.send).not.toHaveBeenCalled();
});

it('rejects a reply not accepted by the SDK', async () => {
  native.reply.mockResolvedValue(false);
  await expect(
    submitChatText('Reply', { ...action, kind: 'reply' }, [message])
  ).rejects.toThrow('not accepted');
});

it('edits the existing message without creating a new one', async () => {
  await submitChatText('Corrected', { ...action, kind: 'edit' }, [message]);
  expect(native.editMessage).toHaveBeenCalledWith(message.id, 'Corrected');
  expect(native.send).not.toHaveBeenCalled();
});

it.each(['reply', 'edit'] as const)(
  'rejects %s when the target was removed',
  async (kind) => {
    await expect(
      submitChatText('Text', { ...action, kind }, [])
    ).rejects.toThrow('no longer available');
    expect(native.reply).not.toHaveBeenCalled();
    expect(native.editMessage).not.toHaveBeenCalled();
  }
);

it('rechecks reply permission before calling native', async () => {
  await expect(
    submitChatText('Reply', { ...action, kind: 'reply' }, [
      { ...message, canReply: false },
    ])
  ).rejects.toThrow('not allowed');
  expect(native.reply).not.toHaveBeenCalled();
});

it.each([
  { ...message, canEdit: false },
  { ...message, type: 'OPERATOR' },
  { ...message, attachment: { name: 'file.pdf' } },
] as WebimMessage[])('does not edit ineligible messages', async (target) => {
  await expect(
    submitChatText('Edit', { ...action, kind: 'edit' }, [target])
  ).rejects.toThrow('no longer be edited');
  expect(native.editMessage).not.toHaveBeenCalled();
});

it('propagates native edit errors so the composer can retain its draft', async () => {
  native.editMessage.mockRejectedValue(new Error('Server refused edit'));
  await expect(
    submitChatText('Edit', { ...action, kind: 'edit' }, [message])
  ).rejects.toThrow('Server refused edit');
});

it('retries only text messages the SDK confirms as FAILED', async () => {
  native.send.mockResolvedValue('retry-id');
  await expect(retryFailedText({ ...message, status: 'FAILED' })).resolves.toBe(
    'retry-id'
  );
  expect(native.send).toHaveBeenCalledWith('Original');

  for (const invalid of [
    message,
    { ...message, status: 'FAILED', type: 'OPERATOR' },
    { ...message, status: 'FAILED', attachment: { name: 'file.pdf' } },
  ] as WebimMessage[]) {
    expect(canRetryFailedText(invalid)).toBe(false);
    await expect(retryFailedText(invalid)).rejects.toThrow('confirmed failed');
  }
  expect(canRetryFailedText({ ...message, status: 'FAILED' })).toBe(true);
  expect(native.send).toHaveBeenCalledTimes(1);
});

it('rejects blank input before invoking the SDK', async () => {
  await expect(submitChatText('  ', null, [])).rejects.toThrow('empty');
  expect(native.send).not.toHaveBeenCalled();
});
