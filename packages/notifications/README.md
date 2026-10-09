# rn-webim-chat-notifications

Optional Notifee notifications for `rn-webim-chat`: direct APNs on iOS,
optional existing Firebase Messaging transport on Android, or external-stack
composition. No chat UI, NSE, import-time handlers, or required Firebase on iOS.

Requires the core's public notification exports and Notifee 9.x. Android ready
transport additionally requires matching `@react-native-firebase/app` and
`@react-native-firebase/messaging` versions (23.x tested against actual typings).
Import that adapter only from `rn-webim-chat-notifications/firebase`.

Read [the integration contract](docs/notifications.md)
for setup, explicit bootstrap/permission ownership, native AppDelegate forwarding,
storage/account isolation, OS display limits, and acceptance requirements.

Published entrypoints are `lib/index.js` and `lib/firebase.js`, with declarations
beside them; Metro resolves source through each export's `react-native` condition.
The forwarding pod is `RnWebimChatNotifications`. Localizations must be copied
into the host main bundle; the pod deliberately does not package a misleading
localization resource bundle.

Repository commands:

```sh
npm install --ignore-scripts --legacy-peer-deps --package-lock=false
npm run verify:core-source
# After the public core exports/build have been integrated:
npm run typecheck
npm run build
npm pack --dry-run
```

Localization setup on macOS (preserves existing keys):

```sh
node scripts/localization.cjs /path/to/host/ios/MyApp en --sync
node scripts/localization.cjs /path/to/host/ios/MyApp ru --sync
```

The helper and tests are not device/server acceptance. No token unregister
behavior is asserted; authorization token events are not push-token events.
