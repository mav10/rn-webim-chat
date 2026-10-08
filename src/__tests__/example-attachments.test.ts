jest.mock('rn-webim-chat', () => ({
  __esModule: true,
  default: {
    sendFile: jest.fn(),
    sendFiles: jest.fn(),
    send: jest.fn(),
    editMessage: jest.fn(),
  },
}));

import RNWebim from 'rn-webim-chat';
import {
  AttachmentSendError,
  submitChatAttachments,
  submitChatDraft,
  submitChatText,
} from '../../example/src/withCustomUI/message-actions';
import type { WebimMessage } from '../types';

const files = [
  {
    uri: 'file://one',
    name: 'one.pdf',
    mime: 'application/pdf',
    extension: 'pdf',
  },
  { uri: 'file://two', name: 'two.jpg', mime: 'image/jpeg', extension: 'jpg' },
];
const sendFile = RNWebim.sendFile as jest.Mock;

function deferredSend() {
  let confirm!: (result: { id: string }) => void;
  const promise = new Promise<{ id: string }>((resolve) => {
    confirm = resolve;
  });
  return { promise, confirm };
}

function composerDraft() {
  const composer = { text: 'Keep this draft', files: [...files] };
  const onAttachmentSent = jest.fn((file: (typeof files)[number]) => {
    composer.files = composer.files.filter(
      (selected) => selected.uri !== file.uri
    );
  });
  const onAttachmentsSent = jest.fn();
  const submit = async (signal?: AbortSignal) => {
    await submitChatDraft(composer.text, composer.files, null, [], {
      signal,
      onAttachmentSent,
      onAttachmentsSent,
    });
    composer.text = '';
  };
  return { composer, onAttachmentSent, onAttachmentsSent, submit };
}

beforeEach(() => jest.resetAllMocks());

afterEach(() => expect(RNWebim.sendFiles).not.toHaveBeenCalled());

it('does not treat a list-only grouped file message as editable text', async () => {
  const message = {
    id: 'group',
    type: 'VISITOR',
    canEdit: true,
    attachments: [{ name: 'one.pdf' }],
  } as WebimMessage;
  await expect(
    submitChatText(
      'Edit',
      { kind: 'edit', messageId: 'group', previousDraft: '' },
      [message]
    )
  ).rejects.toThrow('no longer be edited');
  expect(RNWebim.editMessage).not.toHaveBeenCalled();
});

it('gates separate file messages and sends text only after both confirmations', async () => {
  const first = deferredSend();
  const second = deferredSend();
  sendFile
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const onProgress = jest.fn();
  const onAttachmentSent = jest.fn();
  const onAttachmentsSent = jest.fn();
  const sending = submitChatDraft('Draft', files, null, [], {
    onProgress,
    onAttachmentSent,
    onAttachmentsSent,
  });
  expect(sendFile).toHaveBeenCalledTimes(1);
  expect(sendFile).toHaveBeenNthCalledWith(
    1,
    'file://one',
    'one.pdf',
    'application/pdf',
    'pdf'
  );
  expect(onAttachmentSent).not.toHaveBeenCalled();
  expect(RNWebim.send).not.toHaveBeenCalled();

  first.confirm({ id: 'first-message' });
  await Promise.resolve();
  expect(onAttachmentSent).toHaveBeenNthCalledWith(1, files[0], 0);
  expect(sendFile).toHaveBeenCalledTimes(2);
  expect(sendFile).toHaveBeenNthCalledWith(
    2,
    'file://two',
    'two.jpg',
    'image/jpeg',
    'jpg'
  );
  expect(onAttachmentsSent).not.toHaveBeenCalled();
  expect(RNWebim.send).not.toHaveBeenCalled();

  second.confirm({ id: 'second-message' });
  await sending;
  expect(onAttachmentSent).toHaveBeenNthCalledWith(2, files[1], 1);
  expect(onAttachmentSent.mock.invocationCallOrder[0]).toBeLessThan(
    sendFile.mock.invocationCallOrder[1]!
  );
  expect(onAttachmentsSent).toHaveBeenCalledTimes(1);
  expect(onAttachmentsSent.mock.invocationCallOrder[0]).toBeLessThan(
    (RNWebim.send as jest.Mock).mock.invocationCallOrder[0]!
  );
  expect(RNWebim.send).toHaveBeenCalledWith('Draft');
  expect(
    onProgress.mock.calls.map(([event]) => [
      event.phase,
      event.completedFiles,
      event.totalFiles,
    ])
  ).toEqual([
    ['uploading', 0, 2],
    ['uploading', 1, 2],
    ['uploading', 1, 2],
    ['sent', 2, 2],
  ]);
  expect(
    new Set(onProgress.mock.calls.map(([event]) => event.operationId)).size
  ).toBe(1);
});

it('sends one file as one genuine single-file message', async () => {
  sendFile.mockResolvedValue({ id: 'single' });
  const onAttachmentSent = jest.fn();
  await expect(
    submitChatAttachments(files.slice(0, 1), { onAttachmentSent })
  ).resolves.toEqual({ id: 'single' });
  expect(sendFile).toHaveBeenCalledTimes(1);
  expect(onAttachmentSent).toHaveBeenCalledWith(files[0], 0);
});

it('snapshots the selection and file values before sending', async () => {
  const selection = files.map((file) => ({ ...file }));
  const first = deferredSend();
  sendFile
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ id: 'second' });
  const sending = submitChatAttachments(selection);
  selection[1]!.uri = 'file://changed';
  selection.splice(0, selection.length);
  first.confirm({ id: 'first' });
  await sending;
  expect(sendFile).toHaveBeenNthCalledWith(
    2,
    'file://two',
    'two.jpg',
    'image/jpeg',
    'jpg'
  );
});

it('removes confirmed files and allows retry of the file the SDK marked failed', async () => {
  const { composer, onAttachmentSent, onAttachmentsSent, submit } =
    composerDraft();
  sendFile
    .mockResolvedValueOnce({ id: 'first' })
    .mockRejectedValueOnce(new Error('Connection lost'));
  const failure = await submit().catch((error) => error);
  expect(failure).toBeInstanceOf(AttachmentSendError);
  expect(failure).toMatchObject({
    stage: 'commit',
    cancelled: false,
    canRetry: true,
  });
  expect(composer.files).toEqual([files[1]]);
  expect(composer.text).toBe('Keep this draft');
  expect(onAttachmentSent).toHaveBeenCalledTimes(1);
  expect(onAttachmentsSent).not.toHaveBeenCalled();
  expect(sendFile).toHaveBeenCalledTimes(2);
  expect(RNWebim.send).not.toHaveBeenCalled();
});

it('preserves the draft and allows retry when the first file send is rejected', async () => {
  const { composer, onAttachmentSent, submit } = composerDraft();
  sendFile.mockRejectedValue(new Error('Send failed'));
  await expect(submit()).rejects.toMatchObject({
    stage: 'commit',
    canRetry: true,
  });
  expect(composer.files).toEqual(files);
  expect(composer.text).toBe('Keep this draft');
  expect(onAttachmentSent).not.toHaveBeenCalled();
  expect(sendFile).toHaveBeenCalledTimes(1);
  expect(RNWebim.send).not.toHaveBeenCalled();
});

it('retries only text after file messages are confirmed and text fails', async () => {
  const { composer, onAttachmentSent, onAttachmentsSent, submit } =
    composerDraft();
  sendFile.mockResolvedValue({ id: 'confirmed' });
  (RNWebim.send as jest.Mock).mockRejectedValueOnce(new Error('Text failed'));
  await expect(submit()).rejects.toThrow('Text failed');
  expect(composer.files).toEqual([]);
  expect(composer.text).toBe('Keep this draft');
  await submit();
  expect(composer.text).toBe('');
  expect(sendFile).toHaveBeenCalledTimes(2);
  expect(onAttachmentSent).toHaveBeenCalledTimes(2);
  expect(onAttachmentsSent).toHaveBeenCalledTimes(1);
  expect(RNWebim.send).toHaveBeenCalledTimes(2);
});

it('cancels before the first send without changing the draft', async () => {
  const controller = new AbortController();
  controller.abort();
  const { composer, submit } = composerDraft();
  await expect(submit(controller.signal)).rejects.toMatchObject({
    stage: 'upload',
    cancelled: true,
    canRetry: true,
  });
  expect(composer.files).toEqual(files);
  expect(composer.text).toBe('Keep this draft');
  expect(sendFile).not.toHaveBeenCalled();
  expect(RNWebim.send).not.toHaveBeenCalled();
});

it('lets an in-flight file confirm after cancellation, then retries only remaining files', async () => {
  const controller = new AbortController();
  const first = deferredSend();
  sendFile.mockReturnValueOnce(first.promise);
  const { composer, onAttachmentSent, submit } = composerDraft();
  const sending = submit(controller.signal);
  controller.abort();
  expect(onAttachmentSent).not.toHaveBeenCalled();
  first.confirm({ id: 'first' });
  await expect(sending).rejects.toMatchObject({
    stage: 'upload',
    cancelled: true,
    canRetry: true,
  });
  expect(composer.files).toEqual([files[1]]);
  expect(composer.text).toBe('Keep this draft');
  expect(sendFile).toHaveBeenCalledTimes(1);
  expect(RNWebim.send).not.toHaveBeenCalled();
  sendFile.mockResolvedValueOnce({ id: 'second' });
  await submit();
  expect(sendFile).toHaveBeenCalledTimes(2);
  expect(sendFile).toHaveBeenNthCalledWith(
    2,
    'file://two',
    'two.jpg',
    'image/jpeg',
    'jpg'
  );
  expect(composer.files).toEqual([]);
  expect(composer.text).toBe('');
});

it('stops the next send when cancellation follows a confirmation', async () => {
  const controller = new AbortController();
  sendFile.mockResolvedValue({ id: 'first' });
  const onAttachmentSent = jest.fn(() => controller.abort());
  await expect(
    submitChatDraft('Draft', files, null, [], {
      signal: controller.signal,
      onAttachmentSent,
    })
  ).rejects.toMatchObject({ cancelled: true, canRetry: true });
  expect(onAttachmentSent).toHaveBeenCalledTimes(1);
  expect(sendFile).toHaveBeenCalledTimes(1);
  expect(RNWebim.send).not.toHaveBeenCalled();
});

it('keeps only text when cancellation occurs during the last file send', async () => {
  const controller = new AbortController();
  const last = deferredSend();
  const { composer, onAttachmentsSent, submit } = composerDraft();
  composer.files = files.slice(0, 1);
  sendFile.mockReturnValueOnce(last.promise);
  const sending = submit(controller.signal);
  controller.abort();
  last.confirm({ id: 'last' });
  await expect(sending).rejects.toMatchObject({
    cancelled: true,
    canRetry: true,
  });
  expect(composer.files).toEqual([]);
  expect(composer.text).toBe('Keep this draft');
  expect(onAttachmentsSent).toHaveBeenCalledTimes(1);
  expect(RNWebim.send).not.toHaveBeenCalled();
  await submit();
  expect(sendFile).toHaveBeenCalledTimes(1);
  expect(RNWebim.send).toHaveBeenCalledWith('Keep this draft');
});

it('does not classify an uncertain in-flight failure as safe cancellation', async () => {
  const controller = new AbortController();
  sendFile.mockImplementation(async () => {
    controller.abort();
    throw new Error('Connection lost');
  });
  await expect(
    submitChatAttachments(files, { signal: controller.signal })
  ).rejects.toMatchObject({
    stage: 'commit',
    cancelled: false,
    canRetry: true,
  });
  expect(sendFile).toHaveBeenCalledTimes(1);
});

it('sends files without text and text without files', async () => {
  sendFile.mockResolvedValue({ id: 'confirmed' });
  await submitChatDraft('  ', files, null, []);
  expect(sendFile).toHaveBeenCalledTimes(2);
  expect(RNWebim.send).not.toHaveBeenCalled();
  await submitChatDraft('Text only', [], null, []);
  expect(RNWebim.send).toHaveBeenCalledWith('Text only');
  expect(sendFile).toHaveBeenCalledTimes(2);
});

it('rejects empty drafts or attachments in edit mode before sending', async () => {
  await expect(submitChatDraft('  ', [], null, [])).rejects.toThrow('empty');
  await expect(
    submitChatDraft(
      'Edit',
      files,
      { kind: 'edit', messageId: 'message', previousDraft: '' },
      []
    )
  ).rejects.toThrow('replying or editing');
  expect(sendFile).not.toHaveBeenCalled();
  expect(RNWebim.send).not.toHaveBeenCalled();
});
