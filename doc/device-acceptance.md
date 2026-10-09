# Device acceptance and migration

## Compatibility

- React Native 0.87.1, React 19.2.3, GiftedChat 3.4.0.
- Android Webim SDK 4.1.4; iOS WebimMobileSDK 4.0.1; minimum iOS 15.1.
- New Architecture uses legacy native-module interop, not a TurboModule rewrite.
- Target server: Webim 10.8.77. Successful native builds alone do not establish server compatibility.

## Changes from 2.2.1

- SDK and operating-system requirements increased. Treat this migration as a major release; the package version has not been bumped or published.
- Use the current TypeScript declarations for message event payloads and numeric timestamps.
- Example sessions are serialized and messages are merged through a store rather than appended twice.
- Bot keyboard responses use message/button IDs, not ordinary text.
- editMessage, deleteMessage, and sendReaction wait for SDK callbacks. reply reports SDK acceptance, not delivery.
- Visitor signatures must come from a backend. Rotate any real private key previously embedded in an app.
- iOS file upload still has SDK memory constraints. Test permitted file sizes rather than assuming unlimited streaming.
- iOS `getLastMessages` and `getNextMessages` reject with `HISTORY_TIMEOUT` after
  18 seconds by default when the SDK does not call back. Set
  `historyTimeoutMs` in `initSession` to override (1-20000 ms). This timeout
  does not disable or clear local history. `debug: true` enables Webim SDK
  logging, delivered by `RNWebim.addLogListener`; request/response logs may
  contain sensitive data and should only be captured in controlled tests.
- iOS `resumeSession` waits for the SDK connection and rejects with
  `SESSION_RESUME_TIMEOUT` after 20 seconds; Android's SDK has no matching
  connection callback, so its promise indicates that the synchronous resume
  request was accepted.

## Automated verification

Run yarn lint, yarn typescript, yarn test --runInBand, yarn prepare, and npm pack --dry-run before release.
Build Android debug/release and iOS Simulator. When the main Gradle cache is damaged, use GRADLE_USER_HOME=/tmp/rn-webim-chat-gradle-home without deleting the user's cache.

## Physical-device checklist

Record OS, app revision, account/location, server version, and SDK versions for each run. Do not record authentication secrets.

- [ ] Android and iPhone: launch Custom chat and complete initialization without native/JS errors.
- [ ] Send text; receive operator text; verify one bubble per message and status changes.
- [ ] Load older history while receiving messages; verify stable IDs and no duplicates.
- [ ] Reply; edit/delete permitted messages; reject missing or forbidden targets.
- [ ] Send like/dislike on permitted messages and observe the resulting SDK events.
- [ ] Receive pending bot keyboard; select a button; verify response and changed keyboard state.
- [ ] Pick image, video, and document; cancel picker; verify progress, success, and errors.
- [ ] Reject an oversized file; run concurrent uploads and verify temporary-file cleanup.
- [ ] Select 2 and 10 files; send one grouped message; verify all files on the operator side and in reloaded history.
- [ ] Fail the second upload, retry retained selection, cancel upload and switch users; never commit a partial group or automatically repeat an uncertain commit.
- [ ] Configure direct APNs / Android FCM, refresh device tokens, and open the chat once from foreground/background/cold-start pushes.
- [ ] Verify ru/en Webim loc-key text with iOS JS stopped, visible-chat suppression, no duplicate system/local banners, and foreign-push coexistence.
- [ ] Background/resume, disconnect/reconnect, logout and user switch; no stale messages or callbacks.
- [ ] On an iPhone, initialize the `makelovepizzaru` production-like account
  with `storeHistoryLocally: true`; load a large history containing attachments,
  keyboard messages, and Cyrillic `location` values. Record whether
  `getLastMessages` and `getNextMessages` complete or reject, and confirm a
  stalled request rejects as `HISTORY_TIMEOUT` within 20 seconds without a
  second completion. Repeat with `debug: true` and inspect
  `RNWebim.addLogListener` output for message-history/SQLite steps; redact
  request/response data before sharing. If local history is unusable, verify
  separately that a newly initialized session with `storeHistoryLocally: false`
  can load server history. Do not treat that as a silent fallback.
- [ ] Scroll long history while receiving messages; test keyboard and safe-area layout.

## Observed run: 2026-10-07

- Restored dependencies with the existing frozen lockfile after disk cleanup; regenerated lib successfully.
- TypeScript, 33 focused Jest tests, and lint passed (five inline-style warnings). npm pack --dry-run includes this document.
- Built the updated arm64 Android release APK and installed it on Samsung SM-A566B without clearing app data.
- Cold launch succeeded; React Native and Webim session initialization were observed. NativeEventEmitter listener registration warnings were fixed and did not recur in the new process.
- The bundled demo account returned UNKNOWN_HOST. Server messaging, keyboard buttons, attachments, and reactions were not accepted as verified.
- Physical iPhone installation remains pending Personal Team signing.

## Remaining prerequisites

Grouped attachments and the opt-in notification companion are implemented in
source and require live server/device acceptance before publication. See
[attachments](attachments.md) and [notifications](notifications.md). The prior
published 2.2.1 package does not contain these APIs. No claim of remote push
unregistration is made by destroying a session.

- Confirm the actual Webim 10.8.77 test account/location; the bundled account is a demo and its server version is unverified.
- Production-like `makelovepizzaru` history reproduction remains pending; the
  SDK 4.0.1 source contains history/SQLite log calls, but a run against the
  production-like dataset is required to establish whether logs identify a
  specific message or SQLite step.
- Configure Maxim Vasin's Personal Team in Xcode for the physical iPhone. The locally valid Maxim Vasin certificate belongs to an organization and must not be substituted for Personal Team.
- Diagnose repeated external Metro SIGKILL separately. A momentary /status response is not evidence of sustained server stability.
- Physical-device checks above remain unchecked until observed; simulator compilation and APK installation are not substitutes.

No commit, tag, version bump, or publication is part of this verification.
