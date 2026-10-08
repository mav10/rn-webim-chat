export const WEBIM_NOTIFICATION_TYPES = {
  'P.OM': 'operatorMessage',
  'P.OF': 'operatorFile',
  'P.OA': 'operatorAccepted',
  'P.CR': 'contactInformationRequest',
  'P.WM': 'widget',
  'P.RO': 'rateOperator',
} as const;

export type WebimNotificationKey = keyof typeof WEBIM_NOTIFICATION_TYPES;
export type WebimNotification = {
  type: (typeof WEBIM_NOTIFICATION_TYPES)[WebimNotificationKey];
  localizationKey: WebimNotificationKey;
  event: 'add' | 'del';
  params: string[];
  location?: string;
  unread?: number;
  messageId?: string;
  chatId?: string;
};
export type WebimNotificationResult =
  | { handled: true; notification: WebimNotification }
  | { handled: false; reason: 'foreign' | 'malformed' | 'unknown' };

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function normalizeWebimNotification(
  payload: unknown
): WebimNotificationResult {
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return { handled: false, reason: 'malformed' };
    }
  }
  const root = record(payload);
  if (!root) return { handled: false, reason: 'malformed' };
  const apns = 'aps' in root;
  if (apns && root.webim !== true) return { handled: false, reason: 'foreign' };
  const fields = apns ? record(record(root.aps)?.alert) : root;
  if (!fields) return { handled: false, reason: 'malformed' };
  const key = fields[apns ? 'loc-key' : 'type'];
  if (typeof key !== 'string')
    return { handled: false, reason: apns ? 'malformed' : 'foreign' };
  if (!Object.prototype.hasOwnProperty.call(WEBIM_NOTIFICATION_TYPES, key)) {
    return { handled: false, reason: 'unknown' };
  }
  const event = fields.event;
  const params =
    fields[apns ? 'loc-args' : 'params'] ?? (event === 'del' ? [] : undefined);
  if (
    (event !== 'add' && event !== 'del') ||
    !Array.isArray(params) ||
    !params.every((param) => typeof param === 'string')
  ) {
    return { handled: false, reason: 'malformed' };
  }
  const unread = root.unread_by_visitor_msg_cnt;
  if (
    (root.location !== undefined && typeof root.location !== 'string') ||
    (unread !== undefined &&
      (typeof unread !== 'number' ||
        !Number.isSafeInteger(unread) ||
        unread < 0))
  ) {
    return { handled: false, reason: 'malformed' };
  }
  const localizationKey = key as WebimNotificationKey;
  const notification: WebimNotification = {
    type: WEBIM_NOTIFICATION_TYPES[localizationKey],
    localizationKey,
    event,
    params: [...params],
  };
  if (typeof root.location === 'string') notification.location = root.location;
  if (typeof unread === 'number') notification.unread = unread;
  for (const field of ['messageId', 'chatId'] as const) {
    if (typeof root[field] === 'string' && root[field])
      notification[field] = root[field];
  }
  return { handled: true, notification };
}

export type WebimNotificationDisplay = { title: string; body: string };
export function localizeWebimNotification(
  notification: WebimNotification,
  locale: 'en' | 'ru' = 'en',
  title = 'Webim'
): WebimNotificationDisplay {
  const [operator = '', text = ''] = notification.params;
  const english: Record<WebimNotificationKey, string> = {
    'P.OM': text ? `${operator}: ${text}` : 'New message',
    'P.OF': operator
      ? `${operator} sent a file${text ? `: ${text}` : ''}`
      : 'New file',
    'P.OA': operator
      ? `${operator} joined the chat`
      : 'An operator joined the chat',
    'P.CR': 'Please provide your contact information',
    'P.WM': 'New message',
    'P.RO': 'Please rate your operator',
  };
  const russian: Record<WebimNotificationKey, string> = {
    'P.OM': text
      ? `${operator}: ${text}`
      : '\u041d\u043e\u0432\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435',
    'P.OF': operator
      ? `${operator} \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u043b \u0444\u0430\u0439\u043b`
      : '\u041d\u043e\u0432\u044b\u0439 \u0444\u0430\u0439\u043b',
    'P.OA': operator
      ? `${operator} \u043f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u0438\u043b\u0441\u044f \u043a \u0447\u0430\u0442\u0443`
      : '\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440 \u0432 \u0447\u0430\u0442\u0435',
    'P.CR':
      '\u041e\u0441\u0442\u0430\u0432\u044c\u0442\u0435 \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435',
    'P.WM':
      '\u041d\u043e\u0432\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435',
    'P.RO':
      '\u041e\u0446\u0435\u043d\u0438\u0442\u0435 \u0440\u0430\u0431\u043e\u0442\u0443 \u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440\u0430',
  };
  return {
    title,
    body: (locale === 'ru' ? russian : english)[notification.localizationKey],
  };
}

export type WebimNotificationIdentity = { accountName: string; userId: string };
export type WebimNotificationTarget = WebimNotificationIdentity & {
  location: string;
  messageId?: string;
  chatId?: string;
};
export interface WebimNotificationStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export type WebimNotificationContext = {
  identity?: WebimNotificationIdentity;
  deliveryId?: string;
  foreground?: boolean;
  deferNavigation?: boolean;
};
export type WebimNotificationControllerConfig = {
  identity: WebimNotificationIdentity;
  location: string;
  onOpenChat(
    target: WebimNotificationTarget,
    notification: WebimNotification
  ): void | Promise<void>;
  acceptsNotification?: (
    notification: WebimNotification,
    identity: WebimNotificationIdentity
  ) => boolean;
  display?: (notification: WebimNotification) => WebimNotificationDisplay;
  locale?: 'en' | 'ru';
  title?: string;
  storage?: WebimNotificationStorage;
  storageKey?: string;
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
  onError?: (code: 'storage' | 'open') => void;
};
type PendingOpen = {
  key: string;
  expires: number;
  notification: WebimNotification;
};
export type WebimNotificationHandling = WebimNotificationResult & {
  status?: 'received' | 'queued' | 'opened' | 'duplicate' | 'ignored';
  shouldDisplay?: boolean;
  display?: WebimNotificationDisplay;
};

export function createWebimNotificationController(
  config: WebimNotificationControllerConfig
) {
  const now = config.now ?? Date.now;
  const ttl = config.ttlMs ?? 5 * 60 * 1000;
  const limit = config.maxEntries ?? 64;
  if (
    !Number.isFinite(ttl) ||
    ttl <= 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1
  ) {
    throw new Error('Invalid notification queue limits');
  }
  let identity: WebimNotificationIdentity | null = { ...config.identity };
  let generation = 0;
  let disposed = false;
  let readiness = { authenticated: false, navigation: false, session: false };
  let visible: { location: string; chatId?: string } | null = null;
  let pending: PendingOpen[] = [];
  const seen = new Map<string, number>();
  let writes: Promise<void> = Promise.resolve();
  let revision = 0;
  let flushing: Promise<void> | undefined;
  const storageKey = config.storageKey ?? 'webim.notification.opens.v1';
  const identityKey = (value: WebimNotificationIdentity) =>
    JSON.stringify([value.accountName, value.userId]);
  const prune = () => {
    pending = pending.filter((entry) => entry.expires > now()).slice(-limit);
    for (const [key, expires] of seen) if (expires <= now()) seen.delete(key);
    while (seen.size > limit * 2) seen.delete(seen.keys().next().value!);
  };
  const persist = () => {
    revision += 1;
    if (!config.storage) return Promise.resolve();
    const storage = config.storage;
    const minimalPending = pending.map((entry) => ({
      ...entry,
      notification: { ...entry.notification, params: [] },
    }));
    const snapshot = identity
      ? JSON.stringify({
          version: 1,
          identity: identityKey(identity),
          pending: minimalPending,
          seen: [...seen],
        })
      : null;
    writes = writes.then(async () => {
      try {
        if (snapshot === null) await storage.removeItem(storageKey);
        else await storage.setItem(storageKey, snapshot);
      } catch {
        config.onError?.('storage');
      }
    });
    return writes;
  };
  const keyFor = (
    notification: WebimNotification,
    context: WebimNotificationContext
  ) => {
    const input = JSON.stringify([
      context.deliveryId ?? notification.messageId ?? null,
      notification,
    ]);
    let first = 2166136261;
    let second = 5381;
    for (const character of input) {
      first = Math.imul(first ^ character.charCodeAt(0), 16777619);
      second = Math.imul(second, 33) ^ character.charCodeAt(0);
    }
    return `${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
  };
  const accepts = (
    notification: WebimNotification,
    context: WebimNotificationContext
  ) =>
    !disposed &&
    identity !== null &&
    (!context.identity ||
      identityKey(context.identity) === identityKey(identity)) &&
    (!notification.location || notification.location === config.location) &&
    (config.acceptsNotification?.(notification, identity) ?? true);
  const ready = () =>
    !disposed &&
    identity &&
    readiness.authenticated &&
    readiness.navigation &&
    readiness.session;

  const flush = async (): Promise<void> => {
    if (flushing) {
      await flushing;
      if (!ready() || !pending.length) return;
      return flush();
    }
    const run = async () => {
      prune();
      while (ready() && pending.length) {
        const entry = pending[0]!;
        const epoch = generation;
        const owner = identity!;
        const target: WebimNotificationTarget = {
          ...owner,
          location: entry.notification.location ?? config.location,
        };
        if (entry.notification.chatId)
          target.chatId = entry.notification.chatId;
        if (entry.notification.messageId)
          target.messageId = entry.notification.messageId;
        try {
          await config.onOpenChat(target, entry.notification);
        } catch {
          config.onError?.('open');
          break;
        }
        if (epoch !== generation) break;
        pending.shift();
        seen.set(`open:${entry.key}`, entry.expires);
        await persist();
        prune();
      }
    };
    flushing = run();
    try {
      await flushing;
    } finally {
      flushing = undefined;
    }
  };

  const handleRemoteNotification = async (
    payload: unknown,
    context: WebimNotificationContext = {}
  ): Promise<WebimNotificationHandling> => {
    const parsed = normalizeWebimNotification(payload);
    if (!parsed.handled) return parsed;
    if (!accepts(parsed.notification, context))
      return { ...parsed, status: 'ignored', shouldDisplay: false };
    prune();
    const key = `receive:${keyFor(parsed.notification, context)}`;
    if (seen.has(key))
      return { ...parsed, status: 'duplicate', shouldDisplay: false };
    seen.set(key, now() + ttl);
    const notification = parsed.notification;
    const relevantVisible =
      visible &&
      visible.location === (notification.location ?? config.location) &&
      (!visible.chatId ||
        (notification.chatId !== undefined &&
          visible.chatId === notification.chatId));
    const shouldDisplay =
      notification.event === 'add' && !(context.foreground && relevantVisible);
    prune();
    const epoch = generation;
    await persist();
    if (epoch !== generation)
      return { ...parsed, status: 'ignored', shouldDisplay: false };
    return {
      ...parsed,
      status: 'received',
      shouldDisplay,
      display:
        config.display?.(notification) ??
        localizeWebimNotification(notification, config.locale, config.title),
    };
  };
  const handleNotificationOpen = async (
    payload: unknown,
    context: WebimNotificationContext = {}
  ): Promise<WebimNotificationHandling> => {
    const parsed = normalizeWebimNotification(payload);
    if (!parsed.handled) return parsed;
    if (
      !accepts(parsed.notification, context) ||
      parsed.notification.event === 'del'
    )
      return { ...parsed, status: 'ignored' };
    prune();
    const key = keyFor(parsed.notification, context);
    if (seen.has(`open:${key}`) || pending.some((entry) => entry.key === key))
      return { ...parsed, status: 'duplicate' };
    pending.push({
      key,
      expires: now() + ttl,
      notification: parsed.notification,
    });
    prune();
    const epoch = generation;
    await persist();
    if (epoch !== generation) return { ...parsed, status: 'ignored' };
    if (!context.deferNavigation) await flush();
    return { ...parsed, status: seen.has(`open:${key}`) ? 'opened' : 'queued' };
  };
  const reset = async (
    nextIdentity: WebimNotificationIdentity | null = null
  ) => {
    generation += 1;
    identity = nextIdentity ? { ...nextIdentity } : null;
    readiness = { authenticated: false, navigation: false, session: false };
    visible = null;
    pending = [];
    seen.clear();
    await persist();
  };
  const restore = async () => {
    if (!config.storage || !identity || disposed) return;
    const epoch = generation;
    const owner = identityKey(identity);
    try {
      await writes;
      if (epoch !== generation || disposed) return;
      const snapshotRevision = revision;
      const raw = await config.storage.getItem(storageKey);
      if (
        !raw ||
        epoch !== generation ||
        disposed ||
        snapshotRevision !== revision
      )
        return;
      const saved = record(JSON.parse(raw));
      if (saved?.version !== 1 || saved.identity !== owner) return;
      const entries = Array.isArray(saved.pending)
        ? saved.pending.slice(-limit)
        : [];
      for (const value of entries) {
        const entry = record(value);
        const normalized = record(entry?.notification);
        if (
          !entry ||
          !normalized ||
          typeof entry.key !== 'string' ||
          typeof entry.expires !== 'number' ||
          entry.expires <= now() ||
          entry.expires > now() + ttl
        )
          continue;
        const parsed = normalizeWebimNotification({
          ...normalized,
          type: normalized.localizationKey,
          unread_by_visitor_msg_cnt: normalized.unread,
        });
        if (
          parsed.handled &&
          accepts(parsed.notification, {}) &&
          !pending.some((item) => item.key === entry.key)
        ) {
          pending.push({
            key: entry.key,
            expires: entry.expires,
            notification: parsed.notification,
          });
        }
      }
      if (Array.isArray(saved.seen))
        for (const value of saved.seen.slice(-limit * 2)) {
          if (
            Array.isArray(value) &&
            typeof value[0] === 'string' &&
            typeof value[1] === 'number' &&
            value[1] > now() &&
            value[1] <= now() + ttl
          )
            seen.set(value[0], value[1]);
        }
      prune();
      pending = pending.filter((entry) => !seen.has(`open:${entry.key}`));
      await flush();
    } catch {
      config.onError?.('storage');
    }
  };
  return {
    handleRemoteNotification,
    handleNotificationOpen,
    restore,
    flush,
    setReadiness: async (value: Partial<typeof readiness>) => {
      readiness = { ...readiness, ...value };
      await flush();
    },
    setChatVisible: (value: typeof visible) => {
      visible = value;
    },
    setIdentity: reset,
    logout: () => reset(null),
    dispose: async () => {
      disposed = true;
      await reset(null);
    },
    getInitialNotification: (): WebimNotification | null => {
      prune();
      const notification = pending[0]?.notification;
      return notification
        ? { ...notification, params: [...notification.params] }
        : null;
    },
    pendingCount: () => {
      prune();
      return pending.length;
    },
  };
}

export type WebimNotificationController = ReturnType<
  typeof createWebimNotificationController
>;
