jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    displayNotification: jest.fn(async () => 'id'), createChannel: jest.fn(async () => 'chat'),
    cancelNotification: jest.fn(async () => undefined), getDisplayedNotifications: jest.fn(async () => []),
    onForegroundEvent: jest.fn(() => jest.fn()), onBackgroundEvent: jest.fn(),
    requestPermission: jest.fn(async () => ({})), getInitialNotification: jest.fn(async () => null),
  },
  EventType: { PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3 },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android', select: (values) => values.default }, NativeModules: { RnWebimChat: {} }, NativeEventEmitter: jest.fn() }));
jest.mock('@react-native-firebase/messaging', () => {
  const provider = { onMessage: jest.fn(() => jest.fn()), onTokenRefresh: jest.fn(() => jest.fn()),
    onNotificationOpenedApp: jest.fn(() => jest.fn()), getInitialNotification: jest.fn(async () => null),
    getToken: jest.fn(async () => 'fcm-token'), setBackgroundMessageHandler: jest.fn() };
  return { __esModule: true, default: jest.fn(() => provider) };
});
const notifee = require('@notifee/react-native').default;
const { Platform, NativeModules, NativeEventEmitter } = require('react-native');
const { createWebimNotificationController } = require('rn-webim-chat');
const { createWebimNotifications, registerWebimBackgroundHandler } = require('../lib/index.js');
const { createWebimFirebaseAdapter, registerWebimFirebaseBackgroundHandler } = require('../lib/firebase.js');
const identity = { accountName: 'account', userId: 'a' };
const payload = { type: 'P.OM', event: 'add', params: ['Operator', 'Message'], location: 'mobile' };
const readiness = { authenticated: true, navigation: true, session: true };
function setup(extra = {}) {
  const onOpenChat = jest.fn();
  const controller = createWebimNotificationController({ identity, location: 'mobile', onOpenChat });
  const notifications = createWebimNotifications({ mode: 'ready', identity, location: 'mobile', controller,
    android: { channel: { id: 'chat', name: 'Chat' }, smallIcon: 'ic_stat_chat' }, ...extra });
  return { controller, notifications, onOpenChat };
}
beforeEach(() => { jest.clearAllMocks(); Platform.OS = 'android'; });
test('import does not register global handlers or request permission', () => {
  expect(notifee.onBackgroundEvent).not.toHaveBeenCalled();
  expect(notifee.requestPermission).not.toHaveBeenCalled();
});
test('Android data display roundtrips minimal payload and account ownership; suppresses duplicates', async () => {
  const { notifications, controller, onOpenChat } = setup();
  await notifications.receive({ ...payload, authorizationToken: 'secret' });
  await notifications.receive(payload);
  expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
  const notification = notifee.displayNotification.mock.calls[0][0];
  expect(JSON.stringify(notification)).not.toContain('secret');
  await controller.setReadiness(readiness);
  await notifications.dispatchNotifeeEvent({ type: 1, detail: { notification } }, true);
  expect(onOpenChat).not.toHaveBeenCalled();
  await controller.flush();
  expect(onOpenChat).toHaveBeenCalledTimes(1);
  await notifications.dispatchNotifeeEvent({ type: 1, detail: { notification } });
  expect(onOpenChat).toHaveBeenCalledTimes(1);
});
test('foreign press is composable and old-account press is ignored', async () => {
  const { notifications, controller, onOpenChat } = setup();
  await controller.setReadiness(readiness);
  expect(await notifications.dispatchNotifeeEvent({ type: 1, detail: { notification: { data: { campaign: 'x' } } } })).toBe(false);
  await notifications.dispatchNotifeeEvent({ type: 1, detail: { notification: { data: {
    webimNotification: JSON.stringify(payload), webimAccount: 'account', webimUser: 'other',
  } } } });
  expect(onOpenChat).not.toHaveBeenCalled();
});
test('raw Notifee APNs-like data stays with the host unless an extractor is supplied', async () => {
  const data = { webim: true, aps: { alert: { 'loc-key': 'P.OM', 'loc-args': [], event: 'add' } } };
  const event = { type: 1, detail: { notification: { data } } };
  expect(await setup().notifications.dispatchNotifeeEvent(event)).toBe(false);
  const { notifications, controller } = setup({ extractNotifeePayload: (value) => value });
  expect(await notifications.dispatchNotifeeEvent(event)).toBe(true);
  expect(controller.pendingCount()).toBe(1);
});
test('delete cancellation errors are categorized without rejecting receipt', async () => {
  const onError = jest.fn();
  notifee.cancelNotification.mockRejectedValueOnce(new Error('cancel failed'));
  await expect(setup({ onError }).notifications.receive({ ...payload, event: 'del' })).resolves.toMatchObject({ handled: true });
  expect(onError).toHaveBeenCalledWith('display');
});
test('ready listeners and initial foreign press are forwarded to the host', async () => {
  const onUnhandledNotifeeEvent = jest.fn();
  const event = { type: 1, detail: { notification: { data: { campaign: 'host' } } } };
  notifee.getInitialNotification.mockResolvedValueOnce(event.detail);
  const { notifications } = setup({ onUnhandledNotifeeEvent });
  await notifications.start();
  await notifee.onForegroundEvent.mock.calls[0][0](event);
  await Promise.resolve();
  await Promise.resolve();
  expect(onUnhandledNotifeeEvent).toHaveBeenCalledTimes(2);
  notifications.stop();
});
test('logout during initial lookup cannot reopen an old notification', async () => {
  let release;
  notifee.getInitialNotification.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const { notifications, controller } = setup();
  const starting = notifications.start();
  await Promise.resolve();
  await Promise.resolve();
  await notifications.logout();
  release({ notification: { data: { webimNotification: JSON.stringify(payload) } } });
  await starting;
  expect(controller.pendingCount()).toBe(0);
});
test('logout cancellation errors are reported and do not reject cleanup', async () => {
  const onError = jest.fn();
  notifee.getDisplayedNotifications.mockRejectedValueOnce(new Error('native failure'));
  await expect(setup({ onError }).notifications.logout()).resolves.toBeUndefined();
  expect(onError).toHaveBeenCalledWith('display');
});
test('logout attempts all owned local alerts despite one cancellation failure and preserves host alerts', async () => {
  const onError = jest.fn();
  notifee.getDisplayedNotifications.mockResolvedValueOnce([
    { id: 'first', notification: { data: { webimNotification: '{}' } } },
    { id: 'host', notification: { data: { campaign: 'host' } } },
    { id: 'second', notification: { data: { webimNotification: '{}' } } },
  ]);
  notifee.cancelNotification.mockRejectedValueOnce(new Error('first failed'));
  await setup({ onError }).notifications.logout();
  expect(notifee.cancelNotification.mock.calls).toEqual([['first'], ['second']]);
  expect(onError).toHaveBeenCalledWith('display');
});
test('Android auto-display and iOS background/system foreground do not create local duplicates', async () => {
  await setup().notifications.receive(payload, { autoDisplayed: true });
  Platform.OS = 'ios';
  await setup().notifications.receive(payload, { foreground: false });
  await setup().notifications.receive(payload, { foreground: true });
  expect(notifee.displayNotification).not.toHaveBeenCalled();
  await setup({ iosForeground: 'local' }).notifications.receive(payload, { foreground: true });
  expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
});
test('visible relevant chat suppresses banners; deletes cancel the same location slot', async () => {
  const { notifications } = setup();
  notifications.setChatVisible({ location: 'mobile' });
  await notifications.receive(payload, { foreground: true });
  expect(notifee.displayNotification).not.toHaveBeenCalled();
  await notifications.receive({ ...payload, event: 'del' });
  expect(notifee.cancelNotification).toHaveBeenCalledTimes(2);
});
test('foreground suppression cancellation failures are categorized on iOS local alerts', async () => {
  Platform.OS = 'ios';
  const onError = jest.fn();
  const { notifications } = setup({ onError, iosForeground: 'local' });
  notifications.setChatVisible({ location: 'mobile' });
  notifee.cancelNotification.mockRejectedValueOnce(new Error('native cancel'));
  await expect(notifications.receive(payload, { foreground: true })).resolves.toMatchObject({ shouldDisplay: false });
  expect(onError).toHaveBeenCalledWith('display');
});
test('Firebase ready callbacks preserve foreign messages and catch synchronous extractor failures', async () => {
  const provider = require('@react-native-firebase/messaging').default();
  const onUnhandledMessage = jest.fn();
  const onError = jest.fn();
  const adapter = createWebimFirebaseAdapter({ notifications: setup().notifications, onPushToken: jest.fn(),
    onUnhandledMessage, onError, extractPayload: (message) => { if (message.fail) throw new Error('extract'); return message.data; } });
  await adapter.start();
  const callback = provider.onMessage.mock.calls[0][0];
  callback({ data: { campaign: 'host' } });
  callback({ fail: true });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(onUnhandledMessage).toHaveBeenCalledWith({ data: { campaign: 'host' } }, 'receive');
  expect(onError).toHaveBeenCalledTimes(1);
  adapter.stop();
});
test('stopping Firebase during token lookup prevents token forwarding and initial opens', async () => {
  const provider = require('@react-native-firebase/messaging').default();
  let release;
  provider.getToken.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const onPushToken = jest.fn();
  const adapter = createWebimFirebaseAdapter({ notifications: setup().notifications, onPushToken, extractPayload: (message) => message.data });
  const starting = adapter.start();
  adapter.stop();
  release('late-token');
  await starting;
  expect(onPushToken).not.toHaveBeenCalled();
  expect(provider.getInitialNotification).not.toHaveBeenCalled();
});
test('external mode does not install listeners; background registration is explicit and composable', async () => {
  const { notifications } = setup({ mode: 'external' });
  await expect(notifications.start()).rejects.toThrow('External mode');
  expect(notifee.onForegroundEvent).not.toHaveBeenCalled();
  const fallback = jest.fn();
  registerWebimBackgroundHandler((event) => notifications.dispatchNotifeeEvent(event, true), fallback);
  const handler = notifee.onBackgroundEvent.mock.calls[0][0];
  await handler({ type: 3, detail: {} });
  expect(fallback).toHaveBeenCalledTimes(1);
  expect(() => registerWebimBackgroundHandler(async () => false)).toThrow('one background handler');
});
test('Android ready adapter uses existing messaging provider; iOS cannot start it', async () => {
  const { notifications } = setup();
  const onPushToken = jest.fn();
  const adapter = createWebimFirebaseAdapter({ notifications, onPushToken, extractPayload: (message) => message.data.envelope });
  await adapter.start();
  expect(onPushToken).toHaveBeenCalledWith({ system: 'fcm', token: 'fcm-token' });
  await adapter.receive({ data: { envelope: JSON.stringify(payload) }, notification: { title: 'OS displayed' } });
  expect(notifee.displayNotification).not.toHaveBeenCalled();
  registerWebimFirebaseBackgroundHandler(adapter);
  const provider = require('@react-native-firebase/messaging').default();
  expect(provider.setBackgroundMessageHandler).toHaveBeenCalledTimes(1);
  adapter.stop();
  Platform.OS = 'ios';
  await expect(adapter.start()).rejects.toThrow('Android-only');
});
test('account switch while channel setup is pending cannot relabel or display an old push', async () => {
  let release;
  notifee.createChannel.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const { notifications } = setup();
  const receiving = notifications.receive(payload);
  await Promise.resolve();
  await Promise.resolve();
  await notifications.setIdentity({ accountName: 'account', userId: 'b' });
  release('chat');
  await receiving;
  expect(notifee.displayNotification).not.toHaveBeenCalled();
});
test('Firebase initial open queues and deduplicates against later messaging open', async () => {
  const provider = require('@react-native-firebase/messaging').default();
  const message = { data: { envelope: JSON.stringify(payload) } };
  provider.getInitialNotification.mockResolvedValueOnce(message);
  const { notifications, controller, onOpenChat } = setup();
  const adapter = createWebimFirebaseAdapter({ notifications, onPushToken: jest.fn(), extractPayload: (value) => value.data.envelope });
  await adapter.start();
  expect(onOpenChat).not.toHaveBeenCalled();
  await controller.setReadiness(readiness);
  await adapter.open(message);
  expect(onOpenChat).toHaveBeenCalledTimes(1);
  adapter.stop();
});
test('direct APNs helper starts without Firebase and processes buffered token/open', async () => {
  Platform.OS = 'ios';
  const onPushToken = jest.fn();
  NativeModules.WebimNotificationsAPNs = {
    configure: jest.fn(), drain: jest.fn(async () => [{ kind: 'token', token: 'apns-hex' },
      { kind: 'open', payload, identity }]), clear: jest.fn(async () => undefined), register: jest.fn(),
  };
  NativeEventEmitter.mockImplementation(() => ({ addListener: jest.fn(() => ({ remove: jest.fn() })) }));
  const { notifications, controller, onOpenChat } = setup({ onPushToken });
  await notifications.start();
  expect(onPushToken).toHaveBeenCalledWith({ system: 'apns', token: 'apns-hex' });
  expect(onOpenChat).not.toHaveBeenCalled();
  await controller.setReadiness(readiness);
  expect(onOpenChat).toHaveBeenCalledTimes(1);
  await notifications.requestPermission();
  expect(NativeModules.WebimNotificationsAPNs.register).toHaveBeenCalledTimes(1);
  expect(notifee.getInitialNotification).not.toHaveBeenCalled();
  notifications.stop();
});