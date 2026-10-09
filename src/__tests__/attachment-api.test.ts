jest.mock('react-native', () => ({
  NativeModules: {
    RnWebimChat: {
      tryAttachFiles: jest.fn(),
      uploadFile: jest.fn(),
      sendUploadedFiles: jest.fn(),
      deleteUploadedFile: jest.fn(),
      setPushToken: jest.fn(),
    },
  },
  NativeEventEmitter: jest.fn(),
  Platform: { select: () => '' },
}));

import { NativeModules } from 'react-native';
import { RNWebim } from '../index';

const native = NativeModules.RnWebimChat;
const file = {
  uri: 'file://one',
  name: 'one.pdf',
  mime: 'application/pdf',
  extension: 'pdf',
};

console.log('test');

beforeEach(() => jest.resetAllMocks());

it('selects multiple files then sends one group through the native promises', async () => {
  native.tryAttachFiles.mockResolvedValue([file, file]);
  native.uploadFile
    .mockResolvedValueOnce('first')
    .mockResolvedValueOnce('second');
  native.sendUploadedFiles.mockResolvedValue({ id: 'message' });
  await expect(
    RNWebim.tryAttachAndSendFiles({ kind: 'documents', maxFiles: 5 })
  ).resolves.toEqual({ id: 'message' });
  expect(native.tryAttachFiles).toHaveBeenCalledWith({
    kind: 'documents',
    maxFiles: 5,
  });
  expect(native.uploadFile).toHaveBeenCalledWith(
    file.uri,
    file.name,
    file.mime,
    file.extension
  );
  expect(native.sendUploadedFiles).toHaveBeenCalledWith(['first', 'second']);
});

it('preserves SDK failure codes and cleans uploaded handles', async () => {
  native.uploadFile
    .mockResolvedValueOnce('first')
    .mockRejectedValueOnce({ code: 'FILE_SIZE_EXCEEDED' });
  native.deleteUploadedFile.mockResolvedValue(undefined);
  await expect(RNWebim.sendFiles([file, file])).rejects.toMatchObject({
    errorCode: 'FILE_SIZE_EXCEEDED',
  });
  expect(native.deleteUploadedFile).toHaveBeenCalledWith('first');
  expect(native.sendUploadedFiles).not.toHaveBeenCalled();
});

it('updates push tokens through a live native method', async () => {
  native.setPushToken.mockResolvedValue(undefined);
  await RNWebim.setPushToken('new-token');
  expect(native.setPushToken).toHaveBeenCalledWith('new-token');
  await expect(RNWebim.setPushToken('')).rejects.toMatchObject({
    errorCode: 'INVALID_PUSH_TOKEN',
  });
  expect(native.setPushToken).toHaveBeenCalledTimes(1);
});
