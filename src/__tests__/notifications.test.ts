import {
  createWebimNotificationController,
  normalizeWebimNotification,
} from '../notifications';

const identity = { accountName: 'account', userId: 'user-a' };
const android = {
  type: 'P.OM',
  event: 'add',
  params: ['Operator', 'Hello'],
  location: 'mobile',
};
const apns = {
  webim: true,
  aps: {
    alert: {
      'loc-key': 'P.OM',
      'loc-args': ['Operator', 'Hello'],
      'event': 'add',
    },
  },
  location: 'mobile',
};
const ready = { authenticated: true, navigation: true, session: true };

describe('notification schemas', () => {
  it('maps verified APNs and Android SDK JSON identically without invented IDs', () => {
    expect(normalizeWebimNotification(apns)).toEqual(
      normalizeWebimNotification(JSON.stringify(android))
    );
    expect(normalizeWebimNotification(apns)).toEqual({
      handled: true,
      notification: {
        type: 'operatorMessage',
        localizationKey: 'P.OM',
        event: 'add',
        params: ['Operator', 'Hello'],
        location: 'mobile',
      },
    });
  });
  it.each(['P.OM', 'P.OF', 'P.OA', 'P.CR', 'P.WM', 'P.RO'])(
    'recognizes %s',
    (type) => {
      expect(normalizeWebimNotification({ ...android, type }).handled).toBe(
        true
      );
    }
  );
  it.each([
    null,
    '{',
    { type: 'P.OM', event: 'bad', params: [] },
    { ...android, params: [1] },
    { ...apns, webim: 'true' },
    { ...android, type: 'P.UNKNOWN' },
    { ...android, unread_by_visitor_msg_cnt: -1 },
    { ...android, location: 7 },
    { aps: { alert: 'hello' }, webim: true },
    { marketing: true },
  ])('rejects malformed or foreign data %p', (payload) => {
    expect(normalizeWebimNotification(payload).handled).toBe(false);
  });
  it('preserves explicit IDs and zero unread only when present', () => {
    expect(
      normalizeWebimNotification({
        ...android,
        messageId: 'm',
        chatId: 'c',
        unread_by_visitor_msg_cnt: 0,
      })
    ).toMatchObject({
      handled: true,
      notification: { messageId: 'm', chatId: 'c', unread: 0 },
    });
  });
});

describe('notification routing', () => {
  const setup = (extra = {}) => {
    const onOpenChat = jest.fn();
    return {
      onOpenChat,
      controller: createWebimNotificationController({
        identity,
        location: 'mobile',
        onOpenChat,
        ...extra,
      }),
    };
  };
  it('receive never navigates; tap waits for all three explicit readiness gates', async () => {
    const { controller, onOpenChat } = setup();
    await controller.handleRemoteNotification(apns);
    await controller.handleNotificationOpen(apns);
    await controller.setReadiness({ authenticated: true, navigation: true });
    expect(onOpenChat).not.toHaveBeenCalled();
    await controller.setReadiness({ session: true });
    expect(onOpenChat).toHaveBeenCalledTimes(1);
    expect(onOpenChat.mock.calls[0][0]).toEqual({
      ...identity,
      location: 'mobile',
    });
    expect((await controller.handleNotificationOpen(android)).status).toBe(
      'duplicate'
    );
  });
  it('headless presses queue even when the foreground controller is ready', async () => {
    const { controller, onOpenChat } = setup();
    await controller.setReadiness(ready);
    expect(
      (await controller.handleNotificationOpen(apns, { deferNavigation: true }))
        .status
    ).toBe('queued');
    expect(onOpenChat).not.toHaveBeenCalled();
    await controller.flush();
    expect(onOpenChat).toHaveBeenCalledTimes(1);
  });
  it('initial notification peeks the oldest pending open without consuming or exposing mutable state', async () => {
    const { controller } = setup();
    expect(controller.getInitialNotification()).toBeNull();
    await controller.handleNotificationOpen(android);
    controller.getInitialNotification()!.params.push('mutation');
    expect(controller.getInitialNotification()!.params).toEqual(android.params);
    expect(controller.pendingCount()).toBe(1);
    await controller.setReadiness(ready);
    expect(controller.getInitialNotification()).toBeNull();
  });
  it('does not merge a stale restore snapshot after a newer open is acknowledged', async () => {
    let completeRead!: (value: string | null) => void;
    let saved: string | null = null;
    const storage = {
      getItem: jest.fn(
        () =>
          new Promise<string | null>((resolve) => {
            completeRead = resolve;
          })
      ),
      setItem: jest.fn(async (_key: string, value: string) => {
        saved = value;
      }),
      removeItem: jest.fn(async () => undefined),
    };
    const { controller, onOpenChat } = setup({ storage });
    await controller.handleNotificationOpen(android);
    const snapshot = saved;
    const restoring = controller.restore();
    await Promise.resolve();
    await controller.setReadiness(ready);
    completeRead(snapshot);
    await restoring;
    expect(onOpenChat).toHaveBeenCalledTimes(1);
    expect(controller.pendingCount()).toBe(0);
  });
  it('flushes a new identity after old navigation completes without acknowledging its old open', async () => {
    let release!: () => void;
    const { controller, onOpenChat } = setup();
    onOpenChat.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    await controller.setReadiness(ready);
    const opening = controller.handleNotificationOpen(android);
    await Promise.resolve();
    await controller.logout();
    await controller.setIdentity({ ...identity, userId: 'new' });
    await controller.handleNotificationOpen(
      { ...android, messageId: 'new' },
      { deferNavigation: true }
    );
    const readying = controller.setReadiness(ready);
    release();
    await Promise.all([opening, readying]);
    expect(onOpenChat).toHaveBeenCalledTimes(2);
    expect(onOpenChat.mock.calls[1][0].userId).toBe('new');
    expect(controller.pendingCount()).toBe(0);
  });
  it('simultaneous opens invoke navigation once', async () => {
    const { controller, onOpenChat } = setup();
    await controller.setReadiness(ready);
    await Promise.all([
      controller.handleNotificationOpen(apns),
      controller.handleNotificationOpen(android),
    ]);
    expect(onOpenChat).toHaveBeenCalledTimes(1);
  });
  it('does not resurrect a stale storage read after logout', async () => {
    let completeRead!: (value: string | null) => void;
    const storage = {
      getItem: jest.fn(
        () =>
          new Promise<string | null>((resolve) => {
            completeRead = resolve;
          })
      ),
      setItem: jest.fn(async () => undefined),
      removeItem: jest.fn(async () => undefined),
    };
    const { controller, onOpenChat } = setup({ storage });
    const restoring = controller.restore();
    await Promise.resolve();
    await controller.logout();
    completeRead(
      JSON.stringify({
        version: 1,
        identity: JSON.stringify(['account', 'user-a']),
        pending: [
          {
            key: 'old',
            expires: Date.now() + 10000,
            notification: {
              localizationKey: 'P.OM',
              event: 'add',
              params: [],
              location: 'mobile',
            },
          },
        ],
      })
    );
    await restoring;
    await controller.setReadiness(ready);
    expect(controller.pendingCount()).toBe(0);
    expect(onOpenChat).not.toHaveBeenCalled();
  });
  it('invalidates an in-flight receipt display decision on logout', async () => {
    let releaseWrite!: () => void;
    const storage = {
      getItem: jest.fn(async () => null),
      removeItem: jest.fn(async () => undefined),
      setItem: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            releaseWrite = resolve;
          })
      ),
    };
    const { controller } = setup({ storage });
    const receiving = controller.handleRemoteNotification(android);
    await Promise.resolve();
    const loggingOut = controller.logout();
    releaseWrite();
    await expect(receiving).resolves.toMatchObject({
      status: 'ignored',
      shouldDisplay: false,
    });
    await loggingOut;
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
  });
  it('suppresses only the visible relevant foreground chat', async () => {
    const { controller } = setup();
    controller.setChatVisible({ location: 'mobile', chatId: 'c' });
    expect(
      (
        await controller.handleRemoteNotification(
          { ...android, chatId: 'c' },
          { foreground: true }
        )
      ).shouldDisplay
    ).toBe(false);
    expect(
      (
        await controller.handleRemoteNotification(
          { ...android, chatId: 'other' },
          { foreground: true }
        )
      ).shouldDisplay
    ).toBe(true);
    expect(
      (await controller.handleRemoteNotification(android, { foreground: true }))
        .shouldDisplay
    ).toBe(true);
  });
  it('never opens deletion, foreign locations, or explicitly mismatched users', async () => {
    const { controller, onOpenChat } = setup();
    await controller.setReadiness(ready);
    for (const payload of [
      { ...android, event: 'del' },
      { ...android, location: 'other' },
    ]) {
      expect((await controller.handleNotificationOpen(payload)).status).toBe(
        'ignored'
      );
    }
    expect(
      (
        await controller.handleNotificationOpen(android, {
          identity: { ...identity, userId: 'b' },
        })
      ).status
    ).toBe('ignored');
    expect(onOpenChat).not.toHaveBeenCalled();
  });
  it('bounds queued taps and expires deduplication', async () => {
    let clock = 100;
    const { controller, onOpenChat } = setup({
      now: () => clock,
      ttlMs: 10,
      maxEntries: 2,
    });
    for (const messageId of ['1', '2', '3'])
      await controller.handleNotificationOpen({ ...android, messageId });
    expect(controller.pendingCount()).toBe(2);
    clock = 111;
    await controller.setReadiness(ready);
    expect(onOpenChat).not.toHaveBeenCalled();
    await controller.handleNotificationOpen(android);
    clock = 122;
    await controller.handleNotificationOpen(android);
    expect(onOpenChat).toHaveBeenCalledTimes(2);
  });
  it('clears queue and gates on account switch and logout', async () => {
    const { controller, onOpenChat } = setup();
    await controller.handleNotificationOpen(apns);
    await controller.setIdentity({ accountName: 'other', userId: 'b' });
    await controller.setReadiness(ready);
    expect(onOpenChat).not.toHaveBeenCalled();
    await controller.logout();
    expect((await controller.handleNotificationOpen(apns)).status).toBe(
      'ignored'
    );
  });
  it('keeps failed navigation pending and acknowledges only successful opens', async () => {
    const { controller, onOpenChat } = setup();
    onOpenChat.mockRejectedValueOnce(new Error('navigation not ready'));
    await controller.setReadiness(ready);
    expect((await controller.handleNotificationOpen(apns)).status).toBe(
      'queued'
    );
    await controller.flush();
    expect(controller.pendingCount()).toBe(0);
    expect(onOpenChat).toHaveBeenCalledTimes(2);
  });
  it('restores minimal pending metadata only for the same identity', async () => {
    let saved: string | null = null;
    const storage = {
      getItem: jest.fn(async () => saved),
      setItem: jest.fn(async (_key: string, value: string) => {
        saved = value;
      }),
      removeItem: jest.fn(async () => {
        saved = null;
      }),
    };
    const first = setup({ storage });
    await first.controller.handleNotificationOpen({
      ...apns,
      authorizationToken: 'secret',
    });
    expect(saved).not.toContain('secret');
    expect(saved).not.toContain('Hello');
    const second = setup({ storage });
    await second.controller.restore();
    await second.controller.setReadiness(ready);
    expect(second.onOpenChat).toHaveBeenCalledTimes(1);
    const third = setup({
      storage,
      identity: { ...identity, userId: 'other' },
    });
    await third.controller.restore();
    await third.controller.setReadiness(ready);
    expect(third.onOpenChat).not.toHaveBeenCalled();
    await third.controller.logout();
    expect(saved).toBeNull();
  });
});
