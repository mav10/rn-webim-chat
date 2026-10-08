# Grouped Attachments

The current source exposes grouped-upload APIs for Android Webim 4.1.4 and iOS
WebimMobileSDK 4.0.1. Android preliminary-upload transport is currently broken;
see Failure And Cancellation below. This feature is not in the previously published 2.2.1.
The server must support upload-then-send; a successful native build is not a
server compatibility check. There is no silent fallback to separate messages.

## Selection And Sending

```ts
import { RNWebim } from 'rn-webim-chat';

const files = await RNWebim.tryAttachFiles({ kind: 'media', maxFiles: 10 });
// Show the selection and let the user remove items in your own UI.
const controller = new AbortController();
const result = await RNWebim.sendFiles(files, {
  signal: controller.signal,
  onProgress: updateProgress,
});
```

`tryAttachFiles` defaults to documents and a maximum of 10 files. Media uses
PHPicker on iOS and the Android document picker filtered to images/videos.
Documents use UIDocumentPicker / Android Storage Access Framework. Selection
requires an active native session. Concurrent pickers reject rather than replace
the previous callback. Cancellation rejects with `ATTACHMENT_CANCELLED`.

Files contain `uri`, `name`, `mime`, and `extension`. Own-picker input must be
readable local files: iOS `file://` URLs, Android `content://` or `file://` URIs.
The native picker creates readable local copies for cloud/document providers.
Account limits for size and MIME still apply; SDK rejection codes propagate.
`maxFiles` can lower the group limit but cannot exceed 10.

`sendFiles` uploads sequentially to bound memory consumption, then sends one
group and resolves its confirmed `{ id }`. Progress identifies the operation,
file index, completed-file count, total-file count, and `uploading`, `committing`,
or `sent` phase. It is not fake byte progress. Keep `onProgress` lightweight;
callback errors cannot undo successful delivery.

`tryAttachAndSendFiles` combines the two calls for products without a preview.
Legacy single-file APIs remain unchanged. Messages and history expose every
file through `attachments`; `attachment` is the first file for old consumers.
Quote data retains the SDK's existing single-attachment contract.

## Example Composer

The custom UI example uses one Send action for text, selected files, or both.
It sends each selected file sequentially through the ordinary `sendFile` API,
creating a separate server-side file message for each, then sends any text.
It does not use the grouped APIs described above. Each confirmed file is removed
from the selection immediately. On partial failure, confirmed files stay removed
while remaining files and text stay in the composer. A file send rejected by the
SDK is marked failed and can be retried from the remaining selection. Text
messages marked `FAILED` by the SDK show an inline Retry action. Connection loss
is shown above the chat. An ambiguous timeout is not retried until history is
reconciled, because the server may already have accepted the message.
Cancellation stops subsequent sends, not the current in-flight request. A
text-only retry does not resend confirmed files.

Local image previews appear in the selection before sending. Chat history shows
images from server attachment URLs and plays server video on demand through
`react-native-video` in the example app. Filenames remain links for every file
type; playback errors fall back to opening the server file. History never uses
local picker URIs. Removing a local original does not remove its uploaded copy.
Serialized JSON text is not interpreted as an attachment; previously sent JSON
messages cannot be converted into real operator-side file messages by rendering.

## Failure And Cancellation

Android SDK 4.1.4 has an unchecked asynchronous upload-response parser. The
library applies a version- and checksum-pinned source patch at build time to
`WebimActions`, `WebimActionsImpl`, and `MessageStreamImpl`, replacing their AAR
classes and nested classes together. A distinct upload backend method returns
the full response DTO as JSON instead of reducing it to a GUID. Only
`uploadFileToServer` uses that method; ordinary `sendFile` keeps its GUID callback.
The request remains the existing online multipart upload, matching the official
Android source and installed iOS SDK contract. No endpoint or selector is guessed.

The parser accepts objects and single string-encoded objects. Other malformed
responses reject with `INVALID_UPLOAD_RESPONSE` instead of crashing the process.
With real metadata, callers of the grouped API can proceed through group commit.
The example composer instead uses ordinary sequential file sends. The patch does not
enable account features or prove that the server avoids individual messages on
upload. Device/account acceptance must verify history, grouped commit, and text
sending separately. Do not treat a failure as proof that no message was delivered,
or retry retained files without reconciling history. ID-only responses remain
invalid rather than being reconstructed into metadata.
See [the patch maintenance notes](../android/SDK_UPLOAD_PATCH.md) when upgrading.

Before commit, cancellation stops the next queued work and cleans known uploaded
handles on a best-effort basis. It may wait for the current upload: the SDK does
not promise true network cancellation. No group is sent after a partial upload
failure. The selected picker URIs remain readable for manual retry within the
same session, but retry starts a new upload operation.

After `committing` starts, do not offer automatic retry or claim cancellation.
A timeout/session interruption can mean that the server accepted the message
but its acknowledgement was lost. Inspect synchronized history or obtain a
server confirmation before retrying. The helper neither retries that commit
nor deletes files that may already belong to a delivered message. Failed
commit handles may require server-side expiration or deliberate reconciliation.

Picker copies are currently released on session destruction, not UI discard.
Long-lived products should bound their selection workflow and end obsolete
sessions; per-selection disk release remains a follow-up. Never cache opaque
upload handles across logout or session changes.

## Low-Level API

Products needing resumable upload workflows can use `uploadFile(file)` returning
an opaque session-bound handle, `sendUploadedFiles(handles)` returning one
message ID, and `deleteUploadedFile(handle)`. Do not expose handles as public
URLs or persist them across sessions. Repeated/busy/stale handles are rejected.
Explicit deletion is caller-authorized; only delete when the upload is known
not to belong to a committed message.

## Acceptance

Verify two mixed files and a ten-file group on both devices, operator view and
reloaded history. Test cloud providers, oversized/type-restricted files,
selection cancellation, second-upload failure, upload retry, logout during
upload and uncertain commit without duplicate messages. Confirm the account's
server version and supported mechanism before release.
