import { RNWebim } from 'rn-webim-chat';
import {
  closeChatSession,
  openChatSession,
} from '../../example/src/services/chat-service';

jest.mock(
  'rn-webim-chat',
  () => ({
    RNWebim: {
      destroySession: jest.fn(async () => {}),
      initSession: jest.fn(async () => {}),
      resumeSession: jest.fn(async () => {}),
    },
  }),
  { virtual: true }
);

const native = RNWebim as jest.Mocked<typeof RNWebim>;

describe('example session transitions', () => {
  it('finishes closing the old owner before opening the new one', async () => {
    const calls: string[] = [];
    native.destroySession.mockImplementation(async () => {
      calls.push('destroy');
    });
    native.initSession.mockImplementation(async (params) => {
      calls.push(`init:${params.accountName}`);
    });
    native.resumeSession.mockImplementation(async () => {
      calls.push('resume');
    });

    const first = {};
    const second = {};
    await openChatSession(first, { accountName: 'first', location: 'default' });
    await Promise.all([
      closeChatSession(first),
      openChatSession(second, { accountName: 'second', location: 'default' }),
    ]);
    await closeChatSession(first);

    expect(calls).toEqual([
      'destroy',
      'init:first',
      'resume',
      'destroy',
      'destroy',
      'init:second',
      'resume',
    ]);
    await closeChatSession(second);
  });

  it('allows the next visitor to initialize after a failed attempt', async () => {
    const failed = {};
    const next = {};
    native.initSession.mockRejectedValueOnce(
      new Error('initialization failed')
    );

    await expect(
      openChatSession(failed, { accountName: 'failed', location: 'default' })
    ).rejects.toThrow('initialization failed');
    await expect(
      openChatSession(next, { accountName: 'next', location: 'default' })
    ).resolves.toBeUndefined();
    await closeChatSession(failed);
    await closeChatSession(next);
  });
});
