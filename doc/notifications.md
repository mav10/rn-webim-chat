# Webim Notifications

The core API is independent of React Native, Notifee, Firebase, and navigation.
The optional `rn-webim-chat-notifications` package adds Notifee display/events,
an Android Firebase Messaging adapter, and a forwarding-only direct APNs pod.
There is no chat UI, Notification Service Extension, Firebase requirement on
iOS, custom Android Firebase service, delegate swizzling, or import-time setup.

## Core Export Contract

The current source exports the module from the public entrypoint:

```ts
export * from './notifications';
```

Rebuild the core before building/publishing the companion. The companion imports
only the public `rn-webim-chat` entrypoint; it does not import unpublished source
paths. Published core 2.2.1 does NOT provide these exports and is unsupported.
The companion peer range (`>=3.0.0-0 <4`) reserves the unreleased major
SDK/platform migration; no version bump or publication is performed here.
The core release must include these exports before the companion can be
published. Until then its development dependency is `file:../..`, using
this repository's rebuilt core. Do not install the old registry core as a
substitute or loosen the peer range to 2.2.1.

```ts
import { createWebimNotificationController } from 'rn-webim-chat';

const controller = createWebimNotificationController({
  identity: { accountName: 'your-account', userId: stableAuthenticatedUserId },
  location: 'mobile',
  locale: 'ru',
  title: 'Support',
  storage: applicationStorage,
  onOpenChat: async (target, notification) => {
    await productNavigation.openChat(target.location, target.chatId);
  },
});

await controller.restore();
await controller.handleRemoteNotification(rawPayload, { foreground: true });
await controller.handleNotificationOpen(rawPayload);
await controller.setReadiness({ authenticated: true });
await controller.setReadiness({ session: true });
await controller.setReadiness({ navigation: true });
controller.setChatVisible({ location: 'mobile' });
```

All three readiness gates default to false. Receipt never navigates or marks
messages read. An open queues until authentication, the relevant Webim session,
and product navigation are explicitly ready. Only a successfully resolved
`onOpenChat` acknowledges it. A rejection retains the open; call `flush()` after
repairing navigation. Set gates false before backgrounding/tearing down the
session or navigation. Headless handlers must pass `deferNavigation: true`.
Avoid calling `flush()` recursively inside `onOpenChat`.

`getInitialNotification()` returns a defensive copy of the oldest unexpired
pending open, or `null`. It is a non-consuming peek, not an OS notification
fetch: repeated calls leave the queue intact. Only successful navigation,
expiry, or reset removes that open. The companion exposes the same getter.

`setChatVisible(null)` stops suppression. Location-only visibility means the
product is showing its configured location chat. Chat-specific visibility
suppresses only when the payload actually supplies that same `chatId`; missing
IDs are not inferred. The controller returns `shouldDisplay` and customizable
`display` text; an external stack decides how to use them.

## Verified Payloads

`normalizeWebimNotification(payload)` accepts an object or JSON string and
returns `{ handled: true, notification }` or
`{ handled: false, reason: 'foreign' | 'malformed' | 'unknown' }`. It never
throws for ordinary malformed JSON. Foreign data remains available to the
host's other handlers.

The installed iOS WebimMobileSDK 4.0.1 parser verifies:

```json
{
  "webim": true,
  "aps": {
    "alert": {
      "loc-key": "P.OM",
      "loc-args": ["Operator", "Message"],
      "event": "add"
    },
    "sound": "default"
  },
  "location": "mobile",
  "unread_by_visitor_msg_cnt": 1
}
```

Android SDK 4.1.4 was inspected with `javap -c -p` and `javap -v` from its cached
JAR. `Webim.parseFcmPushNotification(String)` forwards JSON to `InternalUtils`;
`WebimPushNotificationImpl` uses Gson serialized fields:

```json
{
  "type": "P.OM",
  "event": "add",
  "params": ["Operator", "Message"],
  "location": "mobile",
  "unread_by_visitor_msg_cnt": 1
}
```

Both schemas recognize `P.OM`, `P.OF`, `P.OA`, `P.CR`, `P.WM`, `P.RO` and
`add`/`del`. Delete events may omit parameters. Unknown types/events and
non-string parameter arrays remain unhandled. Optional location must be a
string; unread must be a nonnegative safe integer. The core does not guess an
FCM envelope key, accept arbitrary `data` as APNs, coerce `webim: "true"`,
synthesize missing counters/IDs, or use SDK visitor-ID filtering.

`messageId` and `chatId` are preserved only if an explicit nonempty string is
present under those extension names. Neither installed parser guarantees them.
Default navigation falls back to the configured location, not an invented
message deep link. The recognized marker is not an authorization boundary.

## Identity, Persistence, And Logout

Use a stable product user ID, never an authorization token, for `identity`.
Transport metadata can supply `context.identity`; mismatches are ignored.
`acceptsNotification(notification, identity)` adds product recipient validation
where your actual server payload supports it. These verified schemas alone do
not identify the account/user: a late push from a previously authenticated
visitor cannot be conclusively attributed from the marker/location alone.
Do not claim server delivery isolation without verifying server detachment or
recipient metadata. The SDK's visitor-ID parser is not trusted here.

`setIdentity(next)` clears pending opens, deduplication, visibility, and every
readiness gate even if the new identity is the same. `logout()` additionally
disables receipt/routing until another identity is set. `dispose()` permanently
disables the controller and clears storage. These operations cannot retract a
navigation callback that already started; the product callback must respect
its own authentication lifecycle. None unregisters a token on Webim's server.

Storage is an injected async `getItem`/`setItem`/`removeItem` interface. There is
no core storage dependency. Call `restore()` before ingestion; `start()` does
this for ready mode. A dedicated controller/storage namespace must have one
writer at a time. Use distinct `storageKey` values for different installations
of the feature. Defaults: five-minute TTL, 64 pending opens, 128 dedup entries.
Serialized writes preserve logout order. Restore validates schema, expiry,
location, and account/user identity, and does not trust stored raw payloads.
An in-flight read is discarded after reset or a newer queue write, so a stale
snapshot cannot resurrect an acknowledged open. Restore before ingestion; if
the host deliberately overlaps them, restore again once ingestion is idle.

Persistence stores normalized routing fields with empty `params`, not message
text or arbitrary/auth payload fields. Restored callbacks therefore receive no
original message text. Dedup keys are non-cryptographic fingerprints, not
recipient authentication. Prefer actual message IDs; otherwise identical
payloads within TTL may coalesce distinct real notifications. `deliveryId`
can distinguish receive events when the transport has a real ID. Open sources
should consistently use the same ID policy (the companion uses normalized
payloads for open deduplication). Do not log payloads or tokens in error paths;
`onError` receives only a category.

Durable headless opens require the injected storage. An in-memory controller in
a terminated headless runtime cannot survive its process. Concurrent foreground
and headless writers need a host-owned serial/transactional pending-open store;
the simple storage interface is not a multi-process database. Do not set
readiness in a headless runtime. Reuse the authenticated identity from a trusted
host store, not notification content, and restore again on app activation if
background events were persisted by a separate runtime.

## Companion Setup

Install the companion and Notifee in the host. For Android ready transport only,
also install matching versions of Firebase App and Messaging. They are optional
peers and are imported only by `rn-webim-chat-notifications/firebase`.

```sh
npm install rn-webim-chat rn-webim-chat-notifications @notifee/react-native
# Android ready transport, if not already supplied by your product:
npm install @react-native-firebase/app @react-native-firebase/messaging
cd ios && pod install
```

The implemented/tested dependency line is Notifee 9.x and Firebase Messaging
23.x. Test your selected versions in a physical-device consumer. No automatic
permission requests or transport registration happen when importing a module.

```ts
import {
  createWebimNotifications,
  registerWebimBackgroundHandler,
} from 'rn-webim-chat-notifications';

const notifications = createWebimNotifications({
  mode: 'ready',
  controller,
  identity: { accountName: 'your-account', userId: stableAuthenticatedUserId },
  location: 'mobile',
  android: {
    channel: { id: 'webim-chat', name: 'Support', sound: 'default' },
    smallIcon: 'ic_stat_chat',
  },
  iosForeground: 'system',
  preview: 'full',
  onPushToken: async ({ system, token }) => {
    await RNWebim.setPushToken(token);
  },
  onRegistrationError: () => recordRegistrationFailureWithoutPayload(),
});

// index/bootstrap, exactly once; do not also install another Notifee handler.
registerWebimBackgroundHandler(
  (event) => notifications.dispatchNotifeeEvent(event, true),
  existingNonWebimBackgroundHandler
);
await notifications.start();
// Product-selected time, after explaining permission need:
await notifications.requestPermission();
```

`start()` installs foreground listeners and drains initial Android Notifee or
buffered direct-APNs events. `stop()` unsubscribes, but leaves controller state
and durable opens intact. Use `notifications.setChatVisible(...)` to synchronize
core and iOS native foreground suppression. Use `notifications.setIdentity`
and `notifications.logout`, not just their core equivalents, to clear the native
queue. Both unsubscribe and invalidate pending startup work; call `start()`
again after setting the next identity. Stop the separate Firebase adapter before
logout/account switch and restart it for the next session, so device-token
callbacks cannot update a session being torn down. Already-started host token
callbacks must also respect the host's own authentication lifecycle.
Logout cancels companion-owned local displayed notifications on both platforms, not
unrelated product notifications. It does not remove already delivered iOS
remote alerts. Global Notifee/Firebase handlers cannot be unregistered; your
dispatcher must ignore events after logout.
Ready mode forwards foreign foreground events and Android initial presses to
`onUnhandledNotifeeEvent`; supply the existing host handler when sharing Notifee.
Cancellation/display failures report `onError('display')` without rejecting
delete, suppression, or logout cleanup.

Initialize sessions with explicit
`pushSystem: 'apns'` on iOS or `'fcm'` on Android before a token is available,
and use `RNWebim.setPushToken(token)` when `onPushToken` fires. Cache the latest
platform token for the next authenticated session. Never subscribe to Webim's
authorization `tokenUpdated` event as a device token; they are unrelated.

### Android Ready Transport

```ts
import {
  createWebimFirebaseAdapter,
  registerWebimFirebaseBackgroundHandler,
} from 'rn-webim-chat-notifications/firebase';

const firebase = createWebimFirebaseAdapter({
  notifications,
  extractPayload: extractVerifiedWebimJSONFromYourFCMMessage,
  onPushToken: ({ token }) => RNWebim.setPushToken(token),
});
registerWebimFirebaseBackgroundHandler(
  firebase,
  otherMessagingBackgroundHandler
);
await firebase.start();
```

The extractor selects your server's confirmed envelope and returns the verified
SDK JSON object/string. It does not implement Webim parsing. No envelope key was
verified by the SDK, so the package deliberately provides no default guess.
Use Firebase's existing native service/headless machinery; do not add another
competing FirebaseMessagingService. Register its background handler early and
exactly once. `start()` installs onMessage, token-refresh, open, and initial-open
callbacks. `stop()` removes foreground listeners. Android ready startup does
not swallow foreign messages: provide `onUnhandledMessage(message, kind)` for
existing receive/open owners, including a foreign initial open. Android ready startup does
not request permission; request it through the companion at product-selected
time. Set up the host Google Services project/plugin/config, notification icon,
channels, and Android 13+ permission.

Background FCM `notification` payloads are treated as already OS displayed and
are not locally displayed. Data-only messages can be displayed through Notifee.
Foreground messages can be displayed once unless the relevant chat is visible.
Delivery may require server priority/platform configuration; background JS is
not guaranteed. Channel sound changes after creation need a new channel ID or
user settings. `del` and relevant foreground suppression cancel the companion's
local location/chat slot; the SDK provides
no guaranteed per-message notification ID. Auto-displayed FCM notifications and
unrelated notifications cannot be reliably canceled by that synthetic slot.

### External Stack

Set `mode: 'external'`; do not call `start()` or the package registration
functions. Compose the handlers into your existing owners:

```ts
const consumed = await notifications.dispatchNotifeeEvent(event, isHeadless);
if (!consumed) await existingEventHandler(event);

const result = await notifications.receive(extractedWebimPayload, {
  foreground: appIsActive,
  autoDisplayed: systemAlreadyDisplayed,
  identity: trustedTransportIdentity,
});
if (!result.handled) await existingPushHandler(rawPush);

await notifications.open(extractedWebimPayload, {
  identity: trustedTransportIdentity,
  deferNavigation: isHeadless,
});
```

For custom Notifee data envelopes, supply `extractNotifeePayload`. Local
companion notifications already carry normalized data and owner identity.
No raw-data fallback is assumed: Notifee PRESS does not guarantee that original
APNs `aps`/`webim` data survives as `notification.data`. Direct APNs response
forwarding is the authoritative remote-open path on iOS; an explicit extractor
may adapt only a host-verified Notifee envelope.
PRESS/default ACTION_PRESS are handled; foreign events and custom actions
remain available to the host. External mode has no automatic listeners,
delegate ownership, or background registrations. External iOS hosts can
register APNs/permissions themselves and forward token/payload explicitly;
using the helper pod is optional for that recipe.

## Direct APNs Forwarding

The helper pod receives Apple's real `NSData` device token and converts it to
hex. Tokens come only from `didRegisterForRemoteNotificationsWithDeviceToken`,
never from launch options, Firebase tokens, or authorization-token events.
It requires Push Notifications entitlement and matching Webim APNs
credentials/topic/environment. Remote-notifications background mode is optional
for background receipt, not required for OS text/sound/tap display.

Import the pod header in your host bridging header:

```objc
#import <RnWebimChatNotifications/WebimNotificationsAPNs.h>
```

Forward alongside existing AppDelegate/factory hooks (preserve superclass and
other SDK behavior in the host):

```swift
override func application(_ application: UIApplication,
  didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
  WebimNotificationsAPNs.didRegisterDeviceToken(deviceToken)
  // Forward to other existing owners as required by the product.
}

override func application(_ application: UIApplication,
  didFailToRegisterForRemoteNotificationsWithError error: Error) {
  WebimNotificationsAPNs.didFailRegistration()
}
```

In the existing UNUserNotificationCenter delegate/multiplexer, forward remote
receipt and response without replacing Notifee's delegate. The helper never
sets `UNUserNotificationCenter.current().delegate` and never calls completions:

```swift
func userNotificationCenter(_ center: UNUserNotificationCenter,
  didReceive response: UNNotificationResponse,
  withCompletionHandler completion: @escaping () -> Void) {
  let recognized = WebimNotificationsAPNs.openPayload(
    response.notification.request.content.userInfo)
  // Compose the existing Notifee/product handler here.
  // The host multiplexer must arrange exactly one final completion call.
}

func userNotificationCenter(_ center: UNUserNotificationCenter,
  willPresent notification: UNNotification,
  withCompletionHandler completion: @escaping (UNNotificationPresentationOptions) -> Void) {
  let payload = notification.request.content.userInfo
  WebimNotificationsAPNs.receivePayload(payload, foreground: true)
  var options: UNNotificationPresentationOptions = []
  if WebimNotificationsAPNs.presentation(for: notification, options: &options) {
    completion(options)
  } else {
    // Delegate non-Webim presentation to the existing owner's completion path.
  }
}
```

Swift imported method names depend on your importer; the authoritative Objective-C
selectors are `presentationForNotification:options:`, `receivePayload:foreground:`,
and `openPayload:`. Adapt the host's existing delegate multiplexer, not an
uncontrolled second delegate assignment. Notifee's own callbacks may also report
the same open; core deduplication handles matching normalized payloads. iOS uses
PRESS events, not deprecated `getInitialNotification()`.

Forward `application:didReceiveRemoteNotification:fetchCompletionHandler:` with
`receivePayload:foreground:` when your host supports background receipt. The
host owns its one final fetch completion. Forwarding `launchOptions`' remote
notification payload is optional for receipt only, not a token and not proof of
a tap; use the UN response hook for opens.

Prebridge events are buffered in app-private UserDefaults for at most five
minutes and 64 entries; receipt/open data is allowlisted and buffered arguments
are redacted. The APNs token is cached separately so it can reach JS when the
bridge starts. This is bounded forwarding, not a guarantee of execution after
force-quit or silent-push delivery. Seed the helper's account/user via
`setAccount:user:` from your trusted native identity store at cold launch, or
the last JS `configure` identity is used. Clear it through companion logout.
An unknown recipient cannot be recovered safely from these SDK payloads: opens
buffered without a known owner carry an empty identity and are ignored rather
than adopted by the next login. Seed the native owner before forwarding if the
product can determine it securely. The helper does not install a native delegate
multiplexer for your product; that explicit host composition is required.

Default `iosForeground: 'system'` uses one remote system presentation owner.
`iosForeground: 'local'` is valid ONLY if the above native presentation hook
suppresses the original remote notification. Then JS can customize a local
foreground alert. Without that hook, local mode can cause duplicate banners.
Visible-chat suppression of remote foreground alerts also requires that hook;
JS alone cannot cancel presentation already decided by iOS/Notifee. Product
multiplexers must preserve these options instead of independently enabling a
second presentation. Never display a local iOS remote notification while in
background/terminated state.

## Localization And Privacy

APNs `loc-key` resolves in the HOST application's main-bundle
`<locale>.lproj/Localizable.strings`, not a pod resource bundle. The companion
ships en/ru templates. Add the host localized files to the application target's
Copy Bundle Resources and verify the built .app contains both localizations.
The sync command cannot edit target membership or prove that bundle placement.

```sh
node node_modules/rn-webim-chat-notifications/scripts/localization.cjs ios/MyApp en --sync
node node_modules/rn-webim-chat-notifications/scripts/localization.cjs ios/MyApp ru --sync
# Without --sync: validate only.
```

On macOS the tool uses Apple's structured `plutil` parser, preserves existing
bytes/keys/translations, and appends only missing keys. Invalid host input fails
without overwriting keys. Known argument counts from the installed iOS SDK
README: `P.OM`/`P.OF` = 2, `P.OA` = 1, `P.CR`/`P.WM` = 0. `P.RO` exists in the
parser but its arity is not documented there; the supplied copy is argument-free
and must be verified against the server. Unknown server types remain unhandled;
do not infer visitor IDs from extra arguments. Customize the templates in the
host, and `display(notification)` for JS foreground/Android text.

`preview: 'private'` replaces locally displayed bodies only. In system iOS
foreground mode this setting does not redact the remote alert, and native
visible-chat suppression requires the host presentation hook above. It cannot redact
already OS-displayed APNs/FCM alert text or rewrite remote sound. Configure the
server/templates/system preview settings for background privacy. Text/sound/
tap-to-chat need no NSE. Rich media and pre-display rewriting are excluded.

## Build And Acceptance

Within this repository, before the core's built public artifacts are ready:

```sh
cd packages/notifications
npm install --ignore-scripts --legacy-peer-deps --package-lock=false
npm run verify:core-source
npm pack --dry-run
```

`verify:core-source` generates ignored `.core-contract` declarations directly
from the owned core source, compiles against real installed dependency typings,
and executes mocked companion/localization tests. It is not a substitute for
the public export. Default package tests never use `.core-contract`; they load
the dependency's built CommonJS entrypoint. After the main owner runs root
`yarn prepare`, refresh the local file dependency if the package manager copied
it instead of linking it, then run:

```sh
npm run typecheck
npm run build
npm test
npm pack --dry-run
```

Acceptance still requires packed-consumer installation, pod/autolinking/link
validation, signed physical iPhone and Android delivery, matching APNs/FCM
server configuration, en/ru OS display while JS is stopped, delayed auth/nav
taps opening once, identity-switch/logout delivery checks, token rotation,
permission denial/regrant, other-stack coexistence, and foreground suppression.
Jest/typechecking/Objective-C syntax checks do not prove device/server delivery.
