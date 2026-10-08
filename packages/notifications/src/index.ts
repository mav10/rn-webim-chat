import notifee, { EventType } from '@notifee/react-native';
import type {
  AndroidChannel,
  Event,
  NotificationAndroid,
} from '@notifee/react-native';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { normalizeWebimNotification } from 'rn-webim-chat';
import type {
  WebimNotification,
  WebimNotificationContext,
  WebimNotificationController,
  WebimNotificationIdentity,
} from 'rn-webim-chat';

export type NotificationMode = 'ready' | 'external';
export type PushToken = { system: 'apns' | 'fcm'; token: string };
export type WebimNotificationsConfig = {
  mode: NotificationMode;
  controller: WebimNotificationController;
  identity: WebimNotificationIdentity;
  location: string;
  android: {
    channel: AndroidChannel;
    smallIcon: string;
    color?: string;
    sound?: string;
  };
  iosForeground?: 'system' | 'local';
  preview?: 'full' | 'private';
  privateBody?: string;
  onPushToken?: (value: PushToken) => void | Promise<void>;
  onRegistrationError?: () => void;
  onError?: (code: 'transport' | 'display' | 'event') => void;
  extractNotifeePayload?: (data: unknown) => unknown;
  onUnhandledNotifeeEvent?: (event: Event) => void | Promise<void>;
};

type APNsEvent = {
  kind: 'token' | 'error' | 'receive' | 'open';
  token?: string;
  payload?: unknown;
  foreground?: boolean;
  identity?: WebimNotificationIdentity;
};
type APNsBridge = {
  configure(
    accountName: string,
    userId: string,
    location: string,
    localForeground: boolean
  ): void;
  setVisible(location: string | null, chatId: string | null): void;
  drain(): Promise<APNsEvent[]>;
  clear(): Promise<void>;
  register(): void;
};

function wirePayload(notification: WebimNotification) {
  return {
    type: notification.localizationKey,
    event: notification.event,
    params: notification.params,
    location: notification.location,
    unread_by_visitor_msg_cnt: notification.unread,
    messageId: notification.messageId,
    chatId: notification.chatId,
  };
}

function notificationId(
  identity: WebimNotificationIdentity,
  notification: WebimNotification
) {
  const input = JSON.stringify([
    identity.accountName,
    identity.userId,
    notification.location ?? '',
    notification.chatId ?? '',
  ]);
  let hash = 2166136261;
  for (const character of input)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `webim-${(hash >>> 0).toString(16)}`;
}

export function createWebimNotifications(config: WebimNotificationsConfig) {
  let identity: WebimNotificationIdentity | null = { ...config.identity };
  let generation = 0;
  let active = false;
  let apns: APNsBridge | undefined;
  let subscriptions: Array<() => void> = [];
  let initialization: Promise<void> | undefined;
  const receive = async (
    payload: unknown,
    context: WebimNotificationContext & { autoDisplayed?: boolean } = {}
  ) => {
    const epoch = generation;
    const result = await config.controller.handleRemoteNotification(payload, {
      ...context,
      identity: context.identity ?? identity ?? undefined,
    });
    if (
      !result.handled ||
      result.status === 'ignored' ||
      result.status === 'duplicate' ||
      !identity ||
      epoch !== generation
    )
      return result;
    const owner = { ...identity };
    const id = notificationId(identity, result.notification);
    if (
      result.notification.event === 'del' ||
      (!result.shouldDisplay && context.foreground)
    ) {
      try {
        await notifee.cancelNotification(id);
      } catch {
        config.onError?.('display');
      }
      return result;
    }
    const localIOS =
      Platform.OS === 'ios' &&
      context.foreground &&
      config.iosForeground === 'local';
    if (
      !result.shouldDisplay ||
      context.autoDisplayed ||
      (Platform.OS === 'ios' && !localIOS)
    )
      return result;
    const android: NotificationAndroid = {
      channelId: config.android.channel.id,
      smallIcon: config.android.smallIcon,
      color: config.android.color,
      sound: config.android.sound,
      pressAction: { id: 'default', launchActivity: 'default' },
    };
    try {
      if (Platform.OS === 'android')
        await notifee.createChannel(config.android.channel);
      if (epoch !== generation) return result;
      await notifee.displayNotification({
        id,
        title: result.display?.title,
        body:
          config.preview === 'private'
            ? config.privateBody ?? 'New message'
            : result.display?.body,
        data: {
          webimNotification: JSON.stringify(wirePayload(result.notification)),
          webimAccount: owner.accountName,
          webimUser: owner.userId,
        },
        android,
        ios: {
          sound: 'default',
          foregroundPresentationOptions: {
            banner: true,
            list: true,
            sound: true,
          },
        },
      });
      if (epoch !== generation) await notifee.cancelNotification(id);
    } catch {
      config.onError?.('display');
    }
    return result;
  };
  const dispatchNotifeeEvent = async (
    event: Event,
    background = false
  ): Promise<boolean> => {
    if (event.type !== EventType.PRESS && event.type !== EventType.ACTION_PRESS)
      return false;
    if (
      event.type === EventType.ACTION_PRESS &&
      event.detail.pressAction?.id !== 'default'
    )
      return false;
    const data = event.detail.notification?.data;
    if (!data) return false;
    const payload =
      data.webimNotification ?? config.extractNotifeePayload?.(data);
    if (payload === undefined) return false;
    const parsed = normalizeWebimNotification(payload);
    if (!parsed.handled) return false;
    const owner =
      typeof data.webimAccount === 'string' &&
      typeof data.webimUser === 'string'
        ? { accountName: data.webimAccount, userId: data.webimUser }
        : undefined;
    await config.controller.handleNotificationOpen(payload, {
      identity: owner,
      deferNavigation: background,
    });
    return true;
  };
  const forwardAPNs = async (event: APNsEvent) => {
    if (event.kind === 'token' && event.token)
      await config.onPushToken?.({ system: 'apns', token: event.token });
    else if (event.kind === 'error') config.onRegistrationError?.();
    else if (event.kind === 'open' && identity)
      await config.controller.handleNotificationOpen(event.payload, {
        identity: event.identity,
      });
    else if (event.kind === 'receive' && identity)
      await receive(event.payload, {
        identity: event.identity,
        foreground: event.foreground,
      });
  };
  const stop = () => {
    generation += 1;
    active = false;
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions = [];
  };
  const start = async () => {
    if (config.mode !== 'ready')
      throw new Error(
        'External mode owns its listeners; use the exported dispatchers'
      );
    if (active) return initialization;
    if (!identity)
      throw new Error('Set identity before starting notifications');
    active = true;
    const epoch = generation;
    const current = () => active && epoch === generation;
    const foregroundEvent = async (event: Event) => {
      if (!current()) return;
      if (!(await dispatchNotifeeEvent(event)))
        await config.onUnhandledNotifeeEvent?.(event);
    };
    initialization = config.controller.restore();
    subscriptions.push(
      notifee.onForegroundEvent((event) => {
        void initialization!
          .then(() => foregroundEvent(event))
          .catch(() => config.onError?.('event'));
      })
    );
    try {
      if (Platform.OS === 'ios') {
        apns = NativeModules.WebimNotificationsAPNs as APNsBridge | undefined;
        if (!apns) throw new Error('WebimNotificationsAPNs pod is not linked');
        apns.configure(
          identity.accountName,
          identity.userId,
          config.location,
          config.iosForeground === 'local'
        );
        const emitter = new NativeEventEmitter(
          NativeModules.WebimNotificationsAPNs
        );
        const subscription = emitter.addListener('WebimAPNs', (event) => {
          void initialization!
            .then(() =>
              current() ? forwardAPNs(event as APNsEvent) : undefined
            )
            .catch(() => config.onError?.('transport'));
        });
        subscriptions.push(() => subscription.remove());
      }
      await initialization;
      if (!current()) return;
      if (Platform.OS === 'android') {
        const initial = await notifee.getInitialNotification();
        if (initial)
          await foregroundEvent({ type: EventType.PRESS, detail: initial });
      } else if (apns) {
        for (const event of await apns.drain()) {
          if (!current()) break;
          await forwardAPNs(event);
        }
      }
    } catch (error) {
      if (current()) stop();
      throw error;
    }
  };
  return {
    mode: config.mode,
    controller: config.controller,
    receive,
    dispatchNotifeeEvent,
    start,
    stop,
    getInitialNotification: () => config.controller.getInitialNotification(),
    open: (payload: unknown, context?: WebimNotificationContext) =>
      config.controller.handleNotificationOpen(payload, context),
    requestPermission: async () => {
      const permission = await notifee.requestPermission();
      if (Platform.OS === 'ios') {
        const bridge = NativeModules.WebimNotificationsAPNs as
          | APNsBridge
          | undefined;
        if (!bridge)
          throw new Error(
            'Direct APNs helper is not linked; external hosts register natively'
          );
        bridge.register();
      }
      return permission;
    },
    setChatVisible: (value: { location: string; chatId?: string } | null) => {
      config.controller.setChatVisible(value);
      apns?.setVisible(value?.location ?? null, value?.chatId ?? null);
    },
    setIdentity: async (value: WebimNotificationIdentity) => {
      stop();
      const epoch = generation;
      identity = { ...value };
      await config.controller.setIdentity(value);
      if (epoch !== generation) return;
      await apns?.clear();
      if (epoch === generation)
        apns?.configure(
          value.accountName,
          value.userId,
          config.location,
          config.iosForeground === 'local'
        );
    },
    logout: async () => {
      stop();
      const epoch = generation;
      identity = null;
      await config.controller.logout();
      if (epoch !== generation) return;
      await apns?.clear();
      try {
        const displayed = await notifee.getDisplayedNotifications();
        if (epoch !== generation) return;
        for (const entry of displayed)
          if (entry.notification.data?.webimNotification && entry.id) {
            if (epoch !== generation) break;
            try {
              await notifee.cancelNotification(entry.id);
            } catch {
              config.onError?.('display');
            }
          }
      } catch {
        config.onError?.('display');
      }
    },
  };
}
export type WebimNotifications = ReturnType<typeof createWebimNotifications>;
export type NotifeeDispatcher = (event: Event) => Promise<boolean>;
let backgroundRegistered = false;
export function registerWebimBackgroundHandler(
  dispatch: NotifeeDispatcher,
  fallback?: (event: Event) => Promise<void>
): void {
  if (backgroundRegistered)
    throw new Error(
      'Notifee supports one background handler; compose dispatchers in the host'
    );
  backgroundRegistered = true;
  notifee.onBackgroundEvent(async (event) => {
    if (!(await dispatch(event))) await fallback?.(event);
  });
}
