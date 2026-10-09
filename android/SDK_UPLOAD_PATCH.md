# Webim 4.1.4 Upload Response Patch

## Status: Full Metadata Callback And Parser Guard

The Maven 4.1.4 `MessageStreamImpl.uploadFileToServer` originally called
`WebimActions.sendFile`, whose callback reduced the upload response to a GUID.
The stream requires the full JSON file object. The patch adds a distinct
`WebimActions.uploadFileToServer(RequestBody, String, String, callback)` method
and its backend implementation, returning
`InternalUtils.toJson(response.getData())`. Only the stream upload method is
rerouted. Legacy `sendFile` still returns a GUID.

The new method uses the same existing `makeRequest`, endpoint, online chat mode,
multipart fields, authentication, and error handling. It changes response
handling, not the wire protocol. The parser guard remains for malformed metadata.

## Verified SDK Contract

Inspection of the installed iOS SDK shows the same transport for normal and
grouped uploads:

- `Implementation/MessageStreamImpl.swift:922` passes a non-null
  `uploadFileToServerCompletionHandler` and a null normal completion handler.
- `Implementation/WebimActionsImpl.swift:142` still sets `chat-mode=online` and
  `client-side-id`, posting to `/l/v/m/upload`.
- `Backend/ActionRequestLoop.swift:200` adds only `page-id` and `auth-token`.
  `createHTTPBody` at line 504 serializes these fields and `webim_upload_file`
  without examining the completion handler or adding a preliminary flag.
- `Backend/ActionRequestLoop.swift:996` passes the full response `data` object to
  `getUploadedFileFrom`, unlike the Maven Android callback's GUID-only value.

The [official Android source](https://github.com/webim/webim-android-sdk-demo/blob/master/sdk/src/main/java/ru/webim/android/sdk/impl/backend/WebimActionsImpl.java)
also uses the online transport, but returns `response.getData().toString()`.
It is not identical to the checksum-pinned Maven 4.1.4 artifact. The
[official additional-features documentation](https://webim.ru/kb/mobile/sdk/v-4-0/android-additional-features.html)
lists upload-then-send APIs among features requiring Webim support to enable;
it does not document a preliminary-upload request flag or distinct endpoint.

These Android and iOS implementations establish the same online request with a
full metadata callback as the SDK contract. No endpoint or selector is invented:
`chat-mode=upload` and `is_preliminary` are not added. Structured serialization
preserves the full DTO instead of reconstructing metadata from a GUID.

Account acceptance is separate from this verified source fix. These local tests
do not prove that the server avoids individual messages during upload. Verify
account feature enablement, synchronized history, one grouped commit, and the
subsequent text send on a device. Once real metadata is returned, the composer
is expected to proceed through group commit, clear the confirmed selection, and
resume text sending. A failed or interrupted operation is not proof that nothing
was delivered; reconcile history before retrying retained files.

## Existing Patch Mechanism

The published SDK calls `InternalUtils.getUploadedFile(response)` inside
`MessageStreamImpl`'s asynchronous upload success callback without catching parse
errors. A JSON string containing an object throws `JsonSyntaxException` before the
React Native callback can reject its promise.

`sdk-upload-patch.gradle` resolves the official Maven Central source artifact:
`ru.webim.sdk:webimclientsdkandroid:4.1.4:sources@jar`. Its SHA-256 and the exact
callback and method text are checked before generating replacement sources. A Gradle
artifact transform removes `MessageStreamImpl`, `FileUrlCreator`,
`WebimActions`, `WebimActionsImpl`, and all their nested classes from the
original AAR. Android compilation supplies the patched sources instead, with
all remaining SDK classes, resources, and transitive dependencies unchanged.
`sdk-artifact-transform.gradle` registers the transform in all projects of the
consuming Gradle build. The library declares the SDK for compilation and runtime
with the same `safe-upload` attribute, so consuming applications receive the
stripped SDK artifact without app-level Gradle wiring or duplicate classes.
The upstream source and license notices remain intact in the generated source.

`FileUrlCreator` is also replaced to include authenticated file URL hashes
whenever auth data is available, regardless of the SDK's `safeUrlEnabled` flag.
The Android bridge exposes `resolveAttachmentUrl(messageId, index, fallback)`
to retrieve a loaded attachment URL after its hash is ready; iOS returns the
SDK-provided fallback URL unchanged.

The upload backend callback, stream routing, and success parser are replaced.
`SafeUploadedFileResponse` accepts an
object or one string-encoded object, validates the metadata required by
`UploadedFile`, and converts parse failures into a typed callback error. The RN
bridge maps that error to `INVALID_UPLOAD_RESPONSE`. Transport failures retain
their SDK error. No global handlers, reflection, retries, separate-message
fallback, or grouped-send changes are involved.

The patch intentionally fails the build if the SDK version or source changes.
When upgrading, verify the upstream asynchronous parser and remove this patch
only after the regression test passes against an upstream fix. Do not merely
update the checksum to bypass review.

From the example Android project, run:

```sh
GRADLE_USER_HOME=/tmp/rn-webim-chat-gradle-home ./gradlew :rn-webim-chat:compileDebugJavaWithJavac
GRADLE_USER_HOME=/tmp/rn-webim-chat-gradle-home ./gradlew :rn-webim-chat:testDebugUnitTest --tests ru.webim.android.sdk.impl.UploadResponsePatchTest
GRADLE_USER_HOME=/tmp/rn-webim-chat-gradle-home ./gradlew :rn-webim-chat:testDebugUnitTest --tests ru.webim.android.sdk.impl.backend.GroupedUploadTransportEvidenceTest
GRADLE_USER_HOME=/tmp/rn-webim-chat-gradle-home ./gradlew :rn-webim-chat:testDebugUnitTest :app:assembleDebug :app:checkDebugDuplicateClasses
```

The regression test reproduces the original Gson error and invokes the real
patched SDK callback on another thread after the upload method returns.
The transport evidence test invokes the actual backend `makeRequest` through
Retrofit, inspects the serialized multipart body, and invokes `runCallback`
with a full `UploadResponse` DTO. It verifies all metadata survives into an
`UploadedFile`, legacy send still returns a GUID, the two multipart requests are
identical apart from their generated boundaries, and optional authentication and
error callbacks retain the SDK contract. The stream proxy rejects legacy
`sendFile` routing. These tests make no network call and are not proof of
successful grouped upload on an account.
