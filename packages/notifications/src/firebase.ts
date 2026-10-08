import messaging from '@react-native-firebase/messaging';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import type { PushToken, WebimNotifications } from './index.js';

export type FirebaseAdapterConfig = {
  notifications: WebimNotifications;
  extractPayload: (message: FirebaseMessagingTypes.RemoteMessage) => unknown;
  onPushToken: (value: PushToken) => void | Promise<void>;
  onError?: () => void;
  onUnhandledMessage?: (
    message: FirebaseMessagingTypes.RemoteMessage,
    kind: 'receive' | 'open'
  ) => void | Promise<void>;
};
export function createWebimFirebaseAdapter(config: FirebaseAdapterConfig) {
  const receive = async (
    message: FirebaseMessagingTypes.RemoteMessage,
    foreground = false
  ) =>
    config.notifications.receive(config.extractPayload(message), {
      deliveryId: message.messageId,
      foreground,
      autoDisplayed: !foreground && !!message.notification,
    });
  const open = async (
    message: FirebaseMessagingTypes.RemoteMessage,
    background = false
  ) =>
    config.notifications.open(config.extractPayload(message), {
      deferNavigation: background,
    });
  let stop: (() => void) | undefined;
  let generation = 0;
  return {
    receive,
    open,
    start: async () => {
      if (Platform.OS !== 'android')
        throw new Error(
          'This FCM adapter is Android-only; iOS uses direct APNs'
        );
      if (config.notifications.mode !== 'ready')
        throw new Error(
          'External mode must compose its existing messaging handlers'
        );
      if (stop) return;
      const epoch = ++generation;
      const current = () => epoch === generation && !!stop;
      const provider = messaging();
      const dispatch = async (
        message: FirebaseMessagingTypes.RemoteMessage,
        kind: 'receive' | 'open'
      ) => {
        if (!current()) return;
        const result = await (kind === 'receive'
          ? receive(message, true)
          : open(message));
        if (!result.handled && current())
          await config.onUnhandledMessage?.(message, kind);
      };
      const onMessage = provider.onMessage((message) => {
        void dispatch(message, 'receive').catch(() => config.onError?.());
      });
      const onToken = provider.onTokenRefresh((token) => {
        void Promise.resolve()
          .then(() => {
            if (current()) return config.onPushToken({ system: 'fcm', token });
          })
          .catch(() => config.onError?.());
      });
      const onOpen = provider.onNotificationOpenedApp((message) => {
        void dispatch(message, 'open').catch(() => config.onError?.());
      });
      stop = () => {
        generation += 1;
        onMessage();
        onToken();
        onOpen();
        stop = undefined;
      };
      try {
        const token = await provider.getToken();
        if (!current()) return;
        await config.onPushToken({ system: 'fcm', token });
        if (!current()) return;
        const initial = await provider.getInitialNotification();
        if (initial) await dispatch(initial, 'open');
      } catch (error) {
        if (current()) stop?.();
        throw error;
      }
    },
    stop: () => stop?.(),
  };
}
let registered = false;
export function registerWebimFirebaseBackgroundHandler(
  adapter: ReturnType<typeof createWebimFirebaseAdapter>,
  fallback?: (message: FirebaseMessagingTypes.RemoteMessage) => Promise<void>
) {
  if (Platform.OS !== 'android')
    throw new Error('Do not register Firebase transport on iOS');
  if (registered)
    throw new Error(
      'Firebase supports one background handler; compose in the host'
    );
  registered = true;
  messaging().setBackgroundMessageHandler(async (message) => {
    const result = await adapter.receive(message);
    if (!result.handled) await fallback?.(message);
  });
}
