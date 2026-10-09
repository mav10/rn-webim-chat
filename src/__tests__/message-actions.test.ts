jest.mock('react-native', () => ({
  NativeModules: {
    RnWebimChat: {
      editMessage: jest.fn(),
      deleteMessage: jest.fn(),
      sendReaction: jest.fn(),
    },
  },
  NativeEventEmitter: jest.fn(),
  Platform: { select: () => '' },
}));

import { NativeModules } from 'react-native';
import { RNWebim } from '../index';

const native = NativeModules.RnWebimChat as {
  editMessage: jest.Mock;
  deleteMessage: jest.Mock;
  sendReaction: jest.Mock;
};

const actions = [
  {
    method: 'editMessage' as const,
    args: ['message-42', 'Updated text'],
    run: () => RNWebim.editMessage('message-42', 'Updated text'),
  },
  {
    method: 'deleteMessage' as const,
    args: ['message-42'],
    run: () => RNWebim.deleteMessage('message-42'),
  },
  {
    method: 'sendReaction' as const,
    args: ['message-42', 'like'],
    run: () => RNWebim.sendReaction('message-42', 'like'),
  },
  {
    method: 'sendReaction' as const,
    args: ['message-42', 'dislike'],
    run: () => RNWebim.sendReaction('message-42', 'dislike'),
  },
];

describe.each(actions)('RNWebim.$method ($args)', ({ method, args, run }) => {
  beforeEach(() => jest.resetAllMocks());

  it('forwards arguments and waits for native completion', async () => {
    let complete!: (value: unknown) => void;
    native[method].mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    const settled = jest.fn();
    const result = run().then(settled);

    expect(native[method]).toHaveBeenCalledWith(...args);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    complete('native-result');
    await result;
    expect(settled).toHaveBeenCalledWith(undefined);
  });

  it.each([
    'MESSAGE_NOT_FOUND',
    'NOT_ALLOWED',
    'INVALID_REACTION',
    'MESSAGE_ACTION_REJECTED',
  ])('preserves native rejection %s', async (code) => {
    native[method].mockRejectedValue({ code, message: 'Action failed' });

    await expect(run()).rejects.toEqual({
      errorCode: code,
      message: 'Action failed',
      errorType: 'common',
    });
  });
});
