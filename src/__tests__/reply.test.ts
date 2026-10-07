jest.mock('react-native', () => {
  return {
    NativeModules: {
      RnWebimChat: {
        addListener: jest.fn(),
        removeListeners: jest.fn(),
        reply: jest.fn(),
        sendSticker: jest.fn(),
        sendKeyboardResponse: jest.fn(),
      },
    },
    NativeEventEmitter: jest.fn().mockImplementation(() => ({
      addListener: jest.fn(),
    })),
    Platform: {
      select: (platforms: Record<string, string>) =>
        platforms.ios ?? platforms.default,
    },
  };
});

import { NativeModules } from 'react-native';
import { RNWebim } from '../index';
import type { WebimMessage } from '../types';

const mockReplyNative = (
  NativeModules as unknown as {
    RnWebimChat: { reply: jest.Mock; sendSticker: jest.Mock };
  }
).RnWebimChat.reply;
const mockSendStickerNative = (
  NativeModules as unknown as {
    RnWebimChat: { sendSticker: jest.Mock };
  }
).RnWebimChat.sendSticker;
const mockSendKeyboardResponseNative = (
  NativeModules as unknown as {
    RnWebimChat: { sendKeyboardResponse: jest.Mock };
  }
).RnWebimChat.sendKeyboardResponse;

describe('RNWebim.reply', () => {
  beforeEach(() => {
    mockReplyNative.mockReset();
    mockSendStickerNative.mockReset();
    mockSendKeyboardResponseNative.mockReset();
  });

  it('forwards the message text and target message ID', async () => {
    mockReplyNative.mockResolvedValue(true);
    const replyTo = { id: 'message-42' } as WebimMessage;

    await expect(RNWebim.reply('A response', replyTo)).resolves.toBe(true);

    expect(mockReplyNative).toHaveBeenCalledWith('A response', 'message-42');
  });

  it('forwards the sticker ID and resolves after native success', async () => {
    mockSendStickerNative.mockResolvedValue(undefined);

    await expect(RNWebim.sendSticker(73)).resolves.toBeUndefined();

    expect(mockSendStickerNative).toHaveBeenCalledWith(73);
  });

  it('forwards the keyboard message and selected button IDs', async () => {
    mockSendKeyboardResponseNative.mockResolvedValue('response-1');

    await expect(
      RNWebim.sendKeyboardResponse('keyboard-42', 'button-7')
    ).resolves.toBe('response-1');

    expect(mockSendKeyboardResponseNative).toHaveBeenCalledWith(
      'keyboard-42',
      'button-7'
    );
  });
});
