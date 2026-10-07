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
- [ ] Background/resume, disconnect/reconnect, logout and user switch; no stale messages or callbacks.
- [ ] Scroll long history while receiving messages; test keyboard and safe-area layout.

## Observed run: 2026-10-07

- Restored dependencies with the existing frozen lockfile after disk cleanup; regenerated lib successfully.
- TypeScript, 33 focused Jest tests, and lint passed (five inline-style warnings). npm pack --dry-run includes this document.
- Built the updated arm64 Android release APK and installed it on Samsung SM-A566B without clearing app data.
- Cold launch succeeded; React Native and Webim session initialization were observed. NativeEventEmitter listener registration warnings were fixed and did not recur in the new process.
- The bundled demo account returned UNKNOWN_HOST. Server messaging, keyboard buttons, attachments, and reactions were not accepted as verified.
- Physical iPhone installation remains pending Personal Team signing.

## Remaining prerequisites

- Confirm the actual Webim 10.8.77 test account/location; the bundled account is a demo and its server version is unverified.
- Configure Maxim Vasin's Personal Team in Xcode for the physical iPhone. The locally valid Maxim Vasin certificate belongs to an organization and must not be substituted for Personal Team.
- Diagnose repeated external Metro SIGKILL separately. A momentary /status response is not evidence of sustained server stability.
- Physical-device checks above remain unchecked until observed; simulator compilation and APK installation are not substitutes.

No commit, tag, version bump, or publication is part of this verification.
