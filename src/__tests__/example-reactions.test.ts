jest.mock(
  'rn-webim-chat',
  () => ({
    __esModule: true,
    default: { sendReaction: jest.fn() },
  }),
  { virtual: true }
);

import RNWebim from 'rn-webim-chat';
import type { WebimMessage } from '../types';
import {
  canSetMessageReaction,
  getMessageReaction,
  submitMessageReaction,
} from '../../example/src/withCustomUI/message-reactions';

const native = RNWebim as jest.Mocked<typeof RNWebim>;
const message = {
  id: 'operator-1',
  canReact: true,
  canChangeReaction: false,
} as WebimMessage;

beforeEach(() => jest.resetAllMocks());

it.each(['LIKE', 'like', 'DISLIKE', 'dislike'])(
  'normalizes the native reaction %s',
  (reaction) => {
    expect(getMessageReaction({ ...message, visitorReaction: reaction })).toBe(
      reaction.toLowerCase()
    );
  }
);

it('does not treat missing or unknown reaction values as a dislike', () => {
  expect(getMessageReaction(message)).toBeUndefined();
  expect(
    getMessageReaction({ ...message, visitorReaction: 'NONE' })
  ).toBeUndefined();
});

it.each(['like', 'dislike'] as const)(
  'sends supported %s reactions to the SDK',
  async (reaction) => {
    await submitMessageReaction(message.id, reaction, [message]);
    expect(native.sendReaction).toHaveBeenCalledWith(message.id, reaction);
  }
);

it('only offers a different reaction when changes are allowed', () => {
  const reacted = {
    ...message,
    canReact: false,
    canChangeReaction: true,
    visitorReaction: 'LIKE',
  };
  expect(canSetMessageReaction(reacted, 'like')).toBe(false);
  expect(canSetMessageReaction(reacted, 'dislike')).toBe(true);
  expect(
    canSetMessageReaction({ ...reacted, canChangeReaction: false }, 'dislike')
  ).toBe(false);
});

it('rechecks permissions immediately before submitting', async () => {
  await expect(
    submitMessageReaction(message.id, 'like', [{ ...message, canReact: false }])
  ).rejects.toThrow('no longer available');
  expect(native.sendReaction).not.toHaveBeenCalled();
});

it('rejects a removed message without calling the SDK', async () => {
  await expect(submitMessageReaction(message.id, 'like', [])).rejects.toThrow(
    'no longer available'
  );
  expect(native.sendReaction).not.toHaveBeenCalled();
});

it('propagates SDK refusals to the error UI', async () => {
  native.sendReaction.mockRejectedValue(new Error('Server refused reaction'));
  await expect(
    submitMessageReaction(message.id, 'like', [message])
  ).rejects.toThrow('Server refused reaction');
});
