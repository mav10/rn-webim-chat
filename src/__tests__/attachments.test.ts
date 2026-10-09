import { sendAttachmentGroup, validateAttachmentLimit } from '../attachments';

const files = [1, 2].map((index) => ({
  uri: `file://${index}`,
  name: `${index}.pdf`,
  mime: 'application/pdf',
  extension: 'pdf',
}));
const createTransport = () => ({
  uploadFile: jest.fn(async (file: (typeof files)[number]) => file.uri),
  sendUploadedFiles: jest.fn(async () => ({ id: 'group' })),
  deleteUploadedFile: jest.fn(async () => undefined),
});

it('uploads sequentially and commits exactly one group', async () => {
  const transport = createTransport();
  const progress = jest.fn();
  await expect(
    sendAttachmentGroup(transport, files, { onProgress: progress })
  ).resolves.toEqual({ id: 'group' });
  expect(transport.uploadFile.mock.calls).toEqual(files.map((file) => [file]));
  expect(transport.sendUploadedFiles).toHaveBeenCalledTimes(1);
  expect(transport.sendUploadedFiles).toHaveBeenCalledWith([
    'file://1',
    'file://2',
  ]);
  expect(transport.deleteUploadedFile).not.toHaveBeenCalled();
  expect(progress.mock.calls.map(([value]) => value.phase)).toEqual([
    'uploading',
    'uploading',
    'committing',
    'sent',
  ]);
});

it('cleans already uploaded handles without committing a partial group', async () => {
  const transport = createTransport();
  transport.uploadFile.mockRejectedValueOnce(new Error('upload failed'));
  await expect(sendAttachmentGroup(transport, files)).rejects.toThrow(
    'upload failed'
  );
  expect(transport.sendUploadedFiles).not.toHaveBeenCalled();
  transport.uploadFile
    .mockResolvedValueOnce('first')
    .mockRejectedValueOnce(new Error('second failed'));
  await expect(sendAttachmentGroup(transport, files)).rejects.toThrow(
    'second failed'
  );
  expect(transport.deleteUploadedFile).toHaveBeenCalledWith('first');
});

it('does not delete possibly committed files or retry an uncertain commit', async () => {
  const transport = createTransport();
  transport.sendUploadedFiles.mockRejectedValue(new Error('uncertain commit'));
  transport.deleteUploadedFile.mockRejectedValue(new Error('cleanup failed'));
  await expect(sendAttachmentGroup(transport, files)).rejects.toThrow(
    'uncertain commit'
  );
  expect(transport.sendUploadedFiles).toHaveBeenCalledTimes(1);
  expect(transport.deleteUploadedFile).not.toHaveBeenCalled();
});

it('preserves upload failure if cleanup also fails', async () => {
  const transport = createTransport();
  transport.uploadFile
    .mockResolvedValueOnce('first')
    .mockRejectedValueOnce(new Error('upload failed'));
  transport.deleteUploadedFile.mockRejectedValue(new Error('cleanup failed'));
  await expect(sendAttachmentGroup(transport, files)).rejects.toThrow(
    'upload failed'
  );
  expect(transport.deleteUploadedFile).toHaveBeenCalledWith('first');
});

it('waits for in-flight upload then cleans it on cancellation', async () => {
  const transport = createTransport();
  const controller = new AbortController();
  transport.uploadFile.mockImplementationOnce(async () => {
    controller.abort();
    return 'first';
  });
  await expect(
    sendAttachmentGroup(transport, files, { signal: controller.signal })
  ).rejects.toMatchObject({ errorCode: 'ATTACHMENT_CANCELLED' });
  expect(transport.uploadFile).toHaveBeenCalledTimes(1);
  expect(transport.sendUploadedFiles).not.toHaveBeenCalled();
  expect(transport.deleteUploadedFile).toHaveBeenCalledWith('first');
});

it('does not lose successful delivery if progress throws or signal aborts during commit', async () => {
  const transport = createTransport();
  const controller = new AbortController();
  transport.sendUploadedFiles.mockImplementationOnce(async () => {
    controller.abort();
    return { id: 'group' };
  });
  await expect(
    sendAttachmentGroup(transport, files, {
      signal: controller.signal,
      onProgress: () => {
        throw new Error('UI failure');
      },
    })
  ).resolves.toEqual({ id: 'group' });
  expect(transport.deleteUploadedFile).not.toHaveBeenCalled();
});

it.each([0, 11, 1.5, NaN])('rejects invalid limit %s', (limit) => {
  expect(() => validateAttachmentLimit(limit)).toThrow();
});

it.each([{ group: [] }, { group: Array(11).fill(files[0]) }])(
  'rejects an invalid group before native upload',
  async ({ group }) => {
    const transport = createTransport();
    await expect(sendAttachmentGroup(transport, group)).rejects.toMatchObject({
      errorCode: 'INVALID_FILES_COUNT',
    });
    expect(transport.uploadFile).not.toHaveBeenCalled();
  }
);
