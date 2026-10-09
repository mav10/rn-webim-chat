package com.rnwebimchat;

import static java.lang.String.format;

import android.app.Activity;
import android.content.Intent;
import android.content.ClipData;
import android.database.Cursor;
import android.provider.OpenableColumns;
import android.net.Uri;
import android.webkit.MimeTypeMap;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import ru.webim.android.sdk.FatalErrorHandler;
import ru.webim.android.sdk.Message;
import ru.webim.android.sdk.MessageListener;
import ru.webim.android.sdk.MessageStream;
import ru.webim.android.sdk.MessageTracker;
import ru.webim.android.sdk.NotFatalErrorHandler;
import ru.webim.android.sdk.Operator;
import ru.webim.android.sdk.ProvidedAuthorizationTokenStateListener;
import ru.webim.android.sdk.Webim;
import ru.webim.android.sdk.WebimError;
import ru.webim.android.sdk.WebimSession;
import ru.webim.android.sdk.UploadedFile;
import ru.webim.android.sdk.impl.MessageReaction;
import ru.webim.android.sdk.impl.WebimErrorImpl;

@ReactModule(name = RnWebimChatModule.NAME)
public class RnWebimChatModule extends ReactContextBaseJavaModule implements
  MessageListener, ProvidedAuthorizationTokenStateListener, FatalErrorHandler, NotFatalErrorHandler, MessageStream.OnlineStatusChangeListener, MessageStream.UnreadByVisitorMessageCountChangeListener, MessageStream.OperatorTypingListener {
  public static final String NAME = "RnWebimChat";
  private static final int FILE_SELECT_CODE = 0;
  private static ReactApplicationContext reactContext = null;

  private Callback fileCbSuccess;
  private Callback fileCbFailure;
  private MessageTracker tracker;
  private WebimSession session;
  private final Map<String, Message> messagesById = new ConcurrentHashMap<>();
  private final Map<String, UploadedFile> uploadedFiles = new HashMap<>();
  private final Set<String> busyUploadHandles = new HashSet<>();
  private final Set<String> attemptedCommitHandles = new HashSet<>();
  private final Map<String, Promise> attachmentOperations = new HashMap<>();
  private final Map<String, Object> attachmentCallbacks = new HashMap<>();
  private final Map<String, File> uploadCopies = new HashMap<>();
  private long attachmentGeneration;
  private static final int MULTI_FILE_SELECT_CODE = 7314;
  private Promise pickerPromise;
  private int pickerLimit;
  private final ExecutorService fileExecutor = Executors.newSingleThreadExecutor();
  // Picker URIs remain retryable until session cleanup; there is no per-selection release API.
  private final Set<File> pickerCopies = new HashSet<>();
  private String pendingPushToken;
  private String pushSystem = "none";

  @ReactMethod
  public void tryAttachFiles(ReadableMap options, Promise promise) {
    if (pickerPromise != null || fileCbSuccess != null) {
      promise.reject("ATTACHMENT_PICKER_BUSY", "A file picker is already open");
      return;
    }
    try {
      String kind = options.getString("kind");
      double maximum = options.getDouble("maxFiles");
      if ((!"media".equals(kind) && !"documents".equals(kind)) || maximum < 1 || maximum > 10 || maximum != Math.floor(maximum)) {
        throw new IllegalArgumentException("kind must be media or documents; maxFiles must be an integer from 1 to 10");
      }
      Activity activity = reactContext.getCurrentActivity();
      if (activity == null) {
        promise.reject("ACTIVITY_UNAVAILABLE", "No activity is available to present the picker");
        return;
      }
      pickerPromise = promise;
      pickerLimit = (int) maximum;
      Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      intent.setType("*/*");
      intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
      if ("media".equals(kind)) intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"});
      activity.runOnUiThread(() -> {
        try {
          activity.startActivityForResult(intent, MULTI_FILE_SELECT_CODE);
        } catch (Exception error) {
          reactContext.runOnNativeModulesQueueThread(() -> finishPickerFailure("SELECT_FILE_FAILED", error.getMessage()));
        }
      });
    } catch (Exception error) {
      promise.reject("INVALID_ATTACHMENT_OPTIONS", error.getMessage(), error);
    }
  }

  private void finishPickerFailure(String code, String message) {
    Promise pending = pickerPromise;
    pickerPromise = null;
    if (pending != null) pending.reject(code, message);
  }

  private void receiveMultipleFiles(int resultCode, Intent data) {
    if (pickerPromise == null) return;
    if (resultCode != Activity.RESULT_OK || data == null) {
      finishPickerFailure("SELECT_FILE_CANCELED", "File selection canceled");
      return;
    }
    List<Uri> uris = new ArrayList<>();
    ClipData clips = data.getClipData();
    if (clips != null) {
      for (int index = 0; index < clips.getItemCount(); index++) uris.add(clips.getItemAt(index).getUri());
    } else if (data.getData() != null) {
      uris.add(data.getData());
    }
    if (uris.isEmpty() || uris.size() > pickerLimit) {
      finishPickerFailure("ATTACHMENT_LIMIT_EXCEEDED", "Selected file count exceeds maxFiles or is empty");
      return;
    }
    final Promise pending = pickerPromise;
    fileExecutor.execute(() -> {
      List<File> copies = new ArrayList<>();
      WritableArray results = Arguments.createArray();
      try {
        for (Uri uri : uris) {
          String name = null;
          try (Cursor cursor = reactContext.getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0);
          }
          if (name == null || name.isEmpty()) name = "attachment";
          String mime = reactContext.getContentResolver().getType(uri);
          int dot = name.lastIndexOf('.');
          String extension = dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
          if (mime == null) mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
          if (mime == null) mime = "application/octet-stream";
          File copy = File.createTempFile("webim-picker-", ".tmp", reactContext.getCacheDir());
          copies.add(copy);
          InputStream input = reactContext.getContentResolver().openInputStream(uri);
          if (input == null) throw new IOException("Selected file cannot be opened");
          writeFully(copy, input);
          WritableMap result = Arguments.createMap();
          result.putString("uri", Uri.fromFile(copy).toString());
          result.putString("name", name);
          result.putString("mime", mime);
          result.putString("extension", extension);
          results.pushMap(result);
        }
        reactContext.runOnNativeModulesQueueThread(() -> {
          if (pickerPromise != pending) {
            for (File copy : copies) copy.delete();
            return;
          }
          pickerCopies.addAll(copies);
          pickerPromise = null;
          pending.resolve(results);
        });
      } catch (Exception error) {
        for (File copy : copies) copy.delete();
        reactContext.runOnNativeModulesQueueThread(() -> {
          if (pickerPromise == pending) finishPickerFailure("SELECT_FILE_FAILED", error.getMessage());
        });
      }
    });
  }

  @ReactMethod
  public void setPushToken(String token, Promise promise) {
    if (token == null || token.trim().isEmpty()) {
      promise.reject("INVALID_PUSH_TOKEN", "A nonempty FCM token is required; empty tokens do not unregister push");
      return;
    }
    if (session != null && !"fcm".equals(pushSystem)) {
      promise.reject("INVALID_PUSH_SYSTEM", "The active session must enable fcm before updating its token");
      return;
    }
    try {
      if (session != null) session.setPushToken(token);
      pendingPushToken = token;
      promise.resolve(null);
    } catch (Exception error) {
      promise.reject("PUSH_TOKEN_UPDATE_FAILED", error.getMessage(), error);
    }
  }

  @ReactMethod
  public void uploadFile(String uri, String name, String mime, String extension, Promise promise) {
    if (session == null) {
      promise.reject("NULL_SESSION", "Upload requires an active session");
      return;
    }
    final String handle = UUID.randomUUID().toString();
    final long generation = attachmentGeneration;
    if (name == null || name.isEmpty() || mime == null || mime.isEmpty() || uri == null) {
      promise.reject("INVALID_ATTACHMENT", "A readable URI, file name and MIME type are required");
      return;
    }
    attachmentOperations.put(handle, promise);
    fileExecutor.execute(() -> {
      File copy = null;
      try {
        copy = File.createTempFile("webim-upload-", ".tmp", reactContext.getCacheDir());
        InputStream input = reactContext.getContentResolver().openInputStream(Uri.parse(uri));
        if (input == null) throw new IOException("File cannot be opened");
        writeFully(copy, input);
        final File prepared = copy;
        reactContext.runOnNativeModulesQueueThread(() -> {
          if (generation != attachmentGeneration || !attachmentOperations.containsKey(handle)) {
            prepared.delete();
            return;
          }
          beginFileUpload(handle, prepared, name, mime);
        });
      } catch (Exception error) {
        if (copy != null) copy.delete();
        reactContext.runOnNativeModulesQueueThread(() -> {
          Promise pending = attachmentOperations.remove(handle);
          if (pending != null) pending.reject("UPLOAD_FILE_FAILED", error.getMessage(), error);
        });
      }
    });
  }

  private void beginFileUpload(String handle, File copy, String name, String mime) {
    uploadCopies.put(handle, copy);
    try {
      MessageStream.UploadFileToServerCallback callback = new MessageStream.UploadFileToServerCallback() {
        @Override
        public void onSuccess(Message.Id id, UploadedFile file) {
          reactContext.runOnNativeModulesQueueThread(() -> {
            Promise pending = attachmentOperations.remove(handle);
            if (pending == null) return;
            finishUploadCopy(handle);
            attachmentCallbacks.remove(handle);
            uploadedFiles.put(handle, file);
            pending.resolve(handle);
          });
        }

        @Override
        public void onFailure(Message.Id id, WebimError<MessageStream.SendFileCallback.SendFileError> error) {
          reactContext.runOnNativeModulesQueueThread(() -> {
            Promise pending = attachmentOperations.remove(handle);
            if (pending == null) return;
            finishUploadCopy(handle);
            attachmentCallbacks.remove(handle);
            String code = error instanceof SafeUploadedFileResponse.InvalidUploadResponseError
              ? ((SafeUploadedFileResponse.InvalidUploadResponseError) error).getCode()
              : error.getErrorType().name();
            handleError(pending, code, error.getErrorString(), false, null);
          });
        }
      };
      attachmentCallbacks.put(handle, callback);
      session.getStream().uploadFileToServer(copy, name, mime, callback);
    } catch (Exception error) {
      attachmentCallbacks.remove(handle);
      Promise pending = attachmentOperations.remove(handle);
      finishUploadCopy(handle);
      if (pending != null) pending.reject("UPLOAD_FILE_FAILED", error.getMessage(), error);
    }
  }

  @ReactMethod
  public void sendUploadedFiles(ReadableArray handles, Promise promise) {
    if (session == null) {
      promise.reject("NULL_SESSION", "Send requires an active session");
      return;
    }
    List<UploadedFile> files = new ArrayList<>();
    Set<String> selected = new HashSet<>();
    final String operation = UUID.randomUUID().toString();
    try {
      if (handles.size() < 1 || handles.size() > 10) throw new IllegalArgumentException("A group must contain 1 to 10 files");
      for (int index = 0; index < handles.size(); index++) {
        String handle = handles.getString(index);
        if (!uploadedFiles.containsKey(handle) || busyUploadHandles.contains(handle) || !selected.add(handle)) {
          throw new IllegalArgumentException("Invalid, duplicate, or busy upload handle");
        }
        files.add(uploadedFiles.get(handle));
      }
      busyUploadHandles.addAll(selected);
      attachmentOperations.put(operation, promise);
      MessageStream.SendFilesCallback callback = new MessageStream.SendFilesCallback() {
        @Override
        public void onSuccess(Message.Id id) {
          reactContext.runOnNativeModulesQueueThread(() -> {
            Promise pending = attachmentOperations.remove(operation);
            if (pending == null) return;
            busyUploadHandles.removeAll(selected);
            attachmentCallbacks.remove(operation);
            for (String handle : selected) {
              uploadedFiles.remove(handle);
              attemptedCommitHandles.remove(handle);
            }
            pending.resolve(getSimpleMap("id", id.toString()));
          });
        }

        @Override
        public void onFailure(Message.Id id, WebimError<MessageStream.SendFileCallback.SendFileError> error) {
          reactContext.runOnNativeModulesQueueThread(() -> {
            Promise pending = attachmentOperations.remove(operation);
            if (pending == null) return;
            busyUploadHandles.removeAll(selected);
            attachmentCallbacks.remove(operation);
            handleError(pending, error.getErrorType().name(), error.getErrorString(), false, null);
          });
        }
      };
      attachmentCallbacks.put(operation, callback);
      attemptedCommitHandles.addAll(selected);
      session.getStream().sendFiles(files, callback);
    } catch (Exception error) {
      attachmentOperations.remove(operation);
      attachmentCallbacks.remove(operation);
      busyUploadHandles.removeAll(selected);
      promise.reject("SEND_UPLOADED_FILES_FAILED", error.getMessage(), error);
    }
  }

  @ReactMethod
  // Explicit deletion is caller-authorized even after an uncertain commit; selected URIs stay valid.
  public void deleteUploadedFile(String handle, Promise promise) {
    UploadedFile file = uploadedFiles.get(handle);
    if (session == null || file == null || busyUploadHandles.contains(handle)) {
      promise.reject("INVALID_UPLOAD_HANDLE", "Unknown, stale, or busy upload handle");
      return;
    }
    final String operation = UUID.randomUUID().toString();
    busyUploadHandles.add(handle);
    attachmentOperations.put(operation, promise);
    try {
      MessageStream.DeleteUploadedFileCallback callback = new MessageStream.DeleteUploadedFileCallback() {
        @Override
        public void onSuccess() {
          reactContext.runOnNativeModulesQueueThread(() -> {
            Promise pending = attachmentOperations.remove(operation);
            if (pending == null) return;
            busyUploadHandles.remove(handle);
            attachmentCallbacks.remove(operation);
            uploadedFiles.remove(handle);
            attemptedCommitHandles.remove(handle);
            pending.resolve(null);
          });
        }

        @Override
        public void onFailure(WebimError<DeleteUploadedFileError> error) {
          reactContext.runOnNativeModulesQueueThread(() -> {
            Promise pending = attachmentOperations.remove(operation);
            if (pending == null) return;
            busyUploadHandles.remove(handle);
            attachmentCallbacks.remove(operation);
            handleError(pending, error.getErrorType().name(), error.getErrorString(), false, null);
          });
        }
      };
      attachmentCallbacks.put(operation, callback);
      session.getStream().deleteUploadedFile(file.getGuid(), callback);
    } catch (Exception error) {
      attachmentOperations.remove(operation);
      attachmentCallbacks.remove(operation);
      busyUploadHandles.remove(handle);
      promise.reject("DELETE_UPLOADED_FILE_FAILED", error.getMessage(), error);
    }
  }

  private void finishUploadCopy(String handle) {
    File copy = uploadCopies.remove(handle);
    if (copy != null) copy.delete();
  }

  @ReactMethod
  public void addListener(String eventName) {}

  @ReactMethod
  public void removeListeners(double count) {}

  public RnWebimChatModule(ReactApplicationContext context) {
    super(context);
    reactContext = context;

    // todo: чистить cb
    ActivityEventListener mActivityEventListener = new BaseActivityEventListener() {
      @Override
      public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode == MULTI_FILE_SELECT_CODE) {
          reactContext.runOnNativeModulesQueueThread(() -> receiveMultipleFiles(resultCode, data));
          return;
        }
        if (requestCode == FILE_SELECT_CODE) {
          if (resultCode == Activity.RESULT_OK && data != null) {
            Uri uri = data.getData();
            Activity _activity = getContext().getCurrentActivity();
            if (_activity != null && uri != null) {
              String mime = _activity.getContentResolver().getType(uri);
              String extension = mime == null
                ? null
                : MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
              String name = extension == null
                ? null
                : uri.getLastPathSegment() + "." + extension;
              if (fileCbSuccess != null) {
                WritableMap _data = Arguments.createMap();
                _data.putString("uri", uri.toString());
                _data.putString("name", name != null ? name.replace(":", "") : null);
                _data.putString("mime", mime);
                _data.putString("extension", extension);
                fileCbSuccess.invoke(_data);
              }
            } else if (fileCbFailure != null) {
              WritableMap errorBody = getErrorMap(MessageStream.SendFileCallback.SendFileError.UNKNOWN.name(),
                "File selection unknown reason",
                true);
              fileCbFailure.invoke(errorBody);
            }
            clearAttachCallbacks();
            return;
          }
          if (resultCode != Activity.RESULT_OK || data == null) {
            if (fileCbFailure != null) {
              WritableMap errorBody = getErrorMap("SELECT_FILE_CANCELED", "Canceled by user", false);
              fileCbFailure.invoke(errorBody);
            }
            clearAttachCallbacks();
          }
        }
      }
    };
    reactContext.addActivityEventListener(mActivityEventListener);
  }

  private ReactApplicationContext getContext() {
    return reactContext;
  }

  @Override
  @NonNull
  public String getName() {
    return NAME;
  }

  @Override
  public Map<String, Object> getConstants() {
    return new HashMap<>();
  }

  private void init(String accountName, String location, @Nullable String accountJSON, @Nullable String providedAuthorizationToken, @Nullable String appVersion, @Nullable Boolean clearVisitorData, @Nullable Boolean storeHistoryLocally, @Nullable String title, @Nullable String pushToken, @Nullable String prechat) {
    Webim.SessionBuilder builder = Webim.newSessionBuilder()
      .setContext(reactContext)
      .setAccountName(accountName)
      .setLocation(location)
      .setErrorHandler(this)
      .setNotFatalErrorHandler(this)
      .setOnlineStatusRequestFrequencyInMillis(1500)
      .setPushSystem(Webim.PushSystem.NONE);

    builder.setPushSystem("fcm".equals(pushSystem) ? Webim.PushSystem.FCM : Webim.PushSystem.NONE);
    if (pushToken != null && "fcm".equals(pushSystem)) {
      builder.setPushToken(pushToken);
    }
    if (accountJSON != null) {
      builder.setVisitorFieldsJson(accountJSON);
    }
    if (appVersion != null) {
      builder.setAppVersion(appVersion);
    }
    if (clearVisitorData != null) {
      builder.setClearVisitorData(clearVisitorData);
    }
    if (storeHistoryLocally != null) {
      builder.setStoreHistoryLocally(storeHistoryLocally);
    }
    if (title != null) {
      builder.setTitle(title);
    }
    if (prechat != null) {
      builder.setPrechatFields(prechat);
    }

    if (providedAuthorizationToken != null) {
      builder.setProvidedAuthorizationTokenStateListener(this, providedAuthorizationToken);
    }
    session = builder.build();
  }

  @ReactMethod
  public void initSession(ReadableMap builderData, Promise promise) {
    if (session != null) {
      promise.resolve(Arguments.createMap());
      return;
    }
    final String accountName;
    final String location;
    try {
      accountName = builderData.getString("accountName");
      location = builderData.getString("location");
    } catch (RuntimeException error) {
      handleError(promise, "INVALID_SESSION_OPTIONS", "accountName and location must be strings", true, error);
      return;
    }
    if (accountName == null || accountName.trim().isEmpty()) {
      handleError(promise, "NULL_ACCOUNT_NAME", "accountName must be a non-empty string", true, null);
      return;
    }
    if (location == null || location.trim().isEmpty()) {
      handleError(promise, "NULL_LOCATION", "location must be a non-empty string", true, null);
      return;
    }

    // optional
    String accountJSON = builderData.hasKey("accountJSON") ? builderData.getString("accountJSON") : null;
    String providedAuthorizationToken = builderData.hasKey("providedAuthorizationToken") ? builderData.getString("providedAuthorizationToken") : null;
    String appVersion = builderData.hasKey("appVersion") ? builderData.getString("appVersion") : null;
    Boolean clearVisitorData = builderData.hasKey("clearVisitorData") ? builderData.getBoolean("clearVisitorData") : null;
    Boolean storeHistoryLocally = builderData.hasKey("storeHistoryLocally") ? builderData.getBoolean("storeHistoryLocally") : null;
    String title = builderData.hasKey("title") ? builderData.getString("title") : null;
    String prechat = builderData.hasKey("prechat") ? builderData.getString("prechat") : null;
    String pushToken = builderData.hasKey("pushToken") ? builderData.getString("pushToken") : pendingPushToken;
    String requestedPushSystem = builderData.hasKey("pushSystem") ? builderData.getString("pushSystem") : (pushToken == null ? "none" : "fcm");
    if (!"none".equals(requestedPushSystem) && !"fcm".equals(requestedPushSystem)) {
      promise.reject("INVALID_PUSH_SYSTEM", "Android supports none or fcm, not apns");
      return;
    }
    if (pushToken != null && (pushToken.trim().isEmpty() || !"fcm".equals(requestedPushSystem))) {
      promise.reject("INVALID_PUSH_TOKEN", "A token requires the fcm transport and cannot be empty");
      return;
    }
    pushSystem = requestedPushSystem;

    try {
      init(accountName, location, accountJSON, providedAuthorizationToken, appVersion, clearVisitorData, storeHistoryLocally, title, pushToken, prechat);
      session.getStream().startChat();
      session.getStream().setChatRead();
      tracker = session.getStream().newMessageTracker(this);

      session.getStream().setUnreadByVisitorMessageCountChangeListener(this);
      session.getStream().setOperatorTypingListener(this);
      promise.resolve(Arguments.createMap());
    } catch (IllegalStateException e) {
      handleError(promise, "NULL_SESSION", e.getLocalizedMessage(), true, e);
    } catch (RuntimeException e) {
      handleError(promise, "WRONG_SESSION", e.getLocalizedMessage(), true, e);
    } catch (Exception e) {
      handleError(promise, FatalErrorType.UNKNOWN.name(), "Session initializing failed", true, e);
    }
  }

  @ReactMethod
  public void resumeSession(Promise promise) {
    try {
      if (session == null) {
        throw new NullPointerException("NULL_SESSION");
      }

      session.resume();
      session.getStream().setChatRead();
      promise.resolve(Arguments.createMap());
    } catch (NullPointerException e) {
      handleError(promise, "NULL_SESSION", "Resume null session", true, e);
    } catch (Exception e) {
      handleError(promise, FatalErrorType.UNKNOWN.name(), e.getLocalizedMessage(), true, e);
    }
  }

  @ReactMethod
  public void pauseSession(Promise promise) {
    try {
      session.pause();
      promise.resolve(Arguments.createMap());
    } catch (NullPointerException e) {
      handleError(promise, "NULL_SESSION", "Pause null session", true, e);
    } catch (Exception e) {
      handleError(promise, "WRONG_SESSION", "Pause session failed", true, e);
    }
  }

  @ReactMethod
  public void destroySession(Boolean clearData, Promise promise) {
    try {
      clearAttachmentState();
      if (session != null) {
        if (tracker != null) {
          tracker.destroy();
          tracker = null;
        }
        if (clearData) {
          session.destroyWithClearVisitorData();
        } else {
          session.destroy();
        }
        session = null;
      }
      messagesById.clear();
      pendingPushToken = null;
      pushSystem = "none";
      promise.resolve(Arguments.createMap());
    } catch (Exception e) {
      handleError(promise, FatalErrorType.UNKNOWN.name(), "Destroy session failed", false, e);
    }
  }

  @ReactMethod
  public void getAllMessages(Promise promise) {
    try {
      tracker.getAllMessages(getMessagesCallback(promise));
    } catch (NullPointerException e) {
      handleError(promise, "NULL_SESSION", "Can not read all messages as session is destroyed", true, e);
    } catch (Exception e) {
      handleError(promise,
        FatalErrorType.UNKNOWN.name(),
        String.format(Locale.ENGLISH, "Can not read all messages. Details: %s", e.getLocalizedMessage()),
        true,
        e);
    }
  }

  @ReactMethod
  public void getLastMessages(int limit, final Promise promise) {
    try {
      tracker.getLastMessages(limit, getMessagesCallback(promise));
    } catch (NullPointerException e) {
      handleError(promise,
        "NULL_SESSION",
        String.format(Locale.ENGLISH, "Can not read last %d message(s) as session or message tracker is destroyed", limit),
        true,
        e);
    } catch (Exception e) {
      handleError(promise,
        FatalErrorType.UNKNOWN.name(),
        format(Locale.ENGLISH, "Can not read last %d message(s). Details: %s", limit, e.getLocalizedMessage()),
        true,
        e);
    }
  }

  @ReactMethod
  public void getNextMessages(int limit, final Promise promise) {
    try {
      tracker.getNextMessages(limit, getMessagesCallback(promise));
    } catch (NullPointerException e) {
      handleError(promise,
        "NULL_SESSION",
        String.format(Locale.ENGLISH, "Can not read next %d message(s) as session or message tracker is destroyed", limit),
        true,
        e);
    } catch (Exception e) {
      handleError(promise,
        FatalErrorType.UNKNOWN.name(),
        format(Locale.ENGLISH, "Can not read next %d message(s). Details: %s", limit, e.getLocalizedMessage()),
        true,
        e);
    }
  }

  @ReactMethod
  public void send(String message, final Promise promise) {
    try {
      Message.Id msgId = session.getStream().sendMessage(message);
      session.getStream().setChatRead();
      promise.resolve(msgId.toString());
    } catch (NullPointerException e) {
      handleError(promise,
        "NULL_SESSION",
        "Can not send a message as session or stream is destroyed",
        true,
        e);
    } catch (Exception e) {
      handleError(promise,
        FatalErrorType.UNKNOWN.name(),
        e.getLocalizedMessage(),
        true,
        e);
    }
  }

  @ReactMethod
  public void resolveAttachmentUrl(String messageId, int index, Promise promise) {
    Message message = messagesById.get(messageId);
    if (session == null || message == null || message.getAttachment() == null) {
      promise.reject("ATTACHMENT_UNAVAILABLE", "The attachment is not available in this session");
      return;
    }
    List<Message.FileInfo> files = message.getAttachment().getFilesInfo();
    if (files == null || index < 0 || index >= files.size()) {
      promise.reject("ATTACHMENT_UNAVAILABLE", "The attachment is not available");
      return;
    }
    String url = files.get(index).getUrl();
    if (url == null || Uri.parse(url).getQueryParameter("hash") == null) {
      promise.reject("ATTACHMENT_URL_NOT_READY", "File authentication is not ready");
      return;
    }
    promise.resolve(url);
  }

  @ReactMethod
  public void reply(String message, String replyToId, final Promise promise) {
    Message replyTo = messagesById.get(replyToId);
    if (replyTo == null) {
      handleError(promise, "MESSAGE_NOT_FOUND", "Reply target is not in the loaded message history", false, null);
      return;
    }

    try {
      boolean accepted = session.getStream().replyMessage(message, replyTo);
      promise.resolve(accepted);
    } catch (NullPointerException e) {
      handleError(promise, "NULL_SESSION", "Can not reply as session or stream is destroyed", true, e);
    } catch (IllegalStateException e) {
      handleError(promise, "NULL_SESSION", e.getLocalizedMessage(), true, e);
    } catch (RuntimeException e) {
      handleError(promise, "WRONG_SESSION", e.getLocalizedMessage(), true, e);
    } catch (Exception e) {
      handleError(promise, FatalErrorType.UNKNOWN.name(), e.getLocalizedMessage(), false, e);
    }
  }

  @ReactMethod
  public void sendSticker(int stickerId, final Promise promise) {
    try {
      session.getStream().sendSticker(stickerId, new MessageStream.SendStickerCallback() {
        @Override
        public void onSuccess() {
          promise.resolve(null);
        }

        @Override
        public void onFailure(WebimError<MessageStream.SendStickerCallback.SendStickerError> error) {
          handleError(promise, error.getErrorType().name(), error.getErrorString(), false, null);
        }
      });
    } catch (NullPointerException e) {
      handleError(promise, "NULL_SESSION", "Can not send a sticker as session or stream is destroyed", true, e);
    } catch (IllegalStateException e) {
      handleError(promise, "NULL_SESSION", e.getLocalizedMessage(), true, e);
    } catch (RuntimeException e) {
      handleError(promise, "WRONG_SESSION", e.getLocalizedMessage(), true, e);
    }
  }

  @ReactMethod
  public void sendKeyboardResponse(String messageId, String buttonId, final Promise promise) {
    try {
      session.getStream().sendKeyboardRequest(messageId, buttonId, new MessageStream.SendKeyboardCallback() {
        @Override
        public void onSuccess(Message.Id id) {
          promise.resolve(id.toString());
        }

        @Override
        public void onFailure(Message.Id id, WebimError<MessageStream.SendKeyboardCallback.SendKeyboardError> error) {
          handleError(promise, error.getErrorType().name(), error.getErrorString(), false, null);
        }
      });
    } catch (NullPointerException e) {
      handleError(promise, "NULL_SESSION", "Can not send a keyboard response as session or stream is destroyed", true, e);
    } catch (IllegalStateException e) {
      handleError(promise, "NULL_SESSION", e.getLocalizedMessage(), true, e);
    } catch (RuntimeException e) {
      handleError(promise, "WRONG_SESSION", e.getLocalizedMessage(), true, e);
    }
  }

  @ReactMethod
  public void editMessage(String messageId, String text, final Promise promise) {
    Message message = messagesById.get(messageId);
    if (message == null) {
      handleError(promise, "MESSAGE_NOT_FOUND", "Message is not in the loaded message history", false, null);
      return;
    }
    try {
      boolean accepted = session.getStream().editMessage(message, text, new MessageStream.EditMessageCallback() {
        @Override
        public void onSuccess(Message.Id id, String editedText) {
          promise.resolve(null);
        }

        @Override
        public void onFailure(Message.Id id, WebimError<EditMessageError> error) {
          handleError(promise, error.getErrorType().name(), error.getErrorString(), false, null);
        }
      });
      if (!accepted) {
        handleError(promise, "MESSAGE_ACTION_REJECTED", "Message editing was not accepted", false, null);
      }
    } catch (NullPointerException | IllegalStateException e) {
      handleError(promise, "NULL_SESSION", e.getLocalizedMessage(), true, e);
    } catch (RuntimeException e) {
      handleError(promise, "WRONG_SESSION", e.getLocalizedMessage(), true, e);
    }
  }

  @ReactMethod
  public void deleteMessage(String messageId, final Promise promise) {
    Message message = messagesById.get(messageId);
    if (message == null) {
      handleError(promise, "MESSAGE_NOT_FOUND", "Message is not in the loaded message history", false, null);
      return;
    }
    try {
      boolean accepted = session.getStream().deleteMessage(message, new MessageStream.DeleteMessageCallback() {
        @Override
        public void onSuccess(Message.Id id) {
          promise.resolve(null);
        }

        @Override
        public void onFailure(Message.Id id, WebimError<DeleteMessageError> error) {
          handleError(promise, error.getErrorType().name(), error.getErrorString(), false, null);
        }
      });
      if (!accepted) {
        handleError(promise, "MESSAGE_ACTION_REJECTED", "Message deletion was not accepted", false, null);
      }
    } catch (NullPointerException | IllegalStateException e) {
      handleError(promise, "NULL_SESSION", e.getLocalizedMessage(), true, e);
    } catch (RuntimeException e) {
      handleError(promise, "WRONG_SESSION", e.getLocalizedMessage(), true, e);
    }
  }

  @ReactMethod
  public void sendReaction(String messageId, String reaction, final Promise promise) {
    if (!"like".equals(reaction) && !"dislike".equals(reaction)) {
      handleError(promise, "INVALID_REACTION", "Reaction must be like or dislike", false, null);
      return;
    }
    Message message = messagesById.get(messageId);
    if (message == null) {
      handleError(promise, "MESSAGE_NOT_FOUND", "Message is not in the loaded message history", false, null);
      return;
    }
    try {
      MessageReaction sdkReaction = "like".equals(reaction) ? MessageReaction.LIKE : MessageReaction.DISLIKE;
      session.getStream().reactMessage(message, sdkReaction, new MessageStream.MessageReactionCallback() {
        @Override
        public void onSuccess(Message.Id id) {
          promise.resolve(null);
        }
        @Override
        public void onFailure(Message.Id id, WebimError<MessageReactionError> error) {
          handleError(promise, error.getErrorType().name(), error.getErrorString(), false, null);
        }
      });
    } catch (NullPointerException | IllegalStateException e) {
      handleError(promise, "NULL_SESSION", e.getLocalizedMessage(), true, e);
    } catch (RuntimeException e) {
      handleError(promise, "WRONG_SESSION", e.getLocalizedMessage(), true, e);
    }
  }

  @ReactMethod
  public void setVisitorTyping(@Nullable String draft, final Promise promise) {
    try {
      session.getStream().setVisitorTyping(draft);
      promise.resolve(null);
    } catch (NullPointerException | IllegalStateException e) {
      handleError(promise, "NULL_SESSION", "Session is destroyed", false, null);
    } catch (RuntimeException e) {
      handleError(promise, "WRONG_SESSION", "Typing update failed", false, null);
    }
  }

  @ReactMethod
  public void readMessages(final Promise promise) {
    try {
      session.getStream().setChatRead();
      promise.resolve(Arguments.createMap());
    } catch (Exception e) {
      handleError(promise,
        FatalErrorType.UNKNOWN.name(),
        e.getLocalizedMessage(),
        false,
        e);
    }
  }

  @ReactMethod
  public void rateOperator(int rate, final Promise promise) {
    try {
      Operator operator = session.getStream().getCurrentOperator();
      if (operator != null) {
        session.getStream().rateOperator(operator.getId(), rate, new MessageStream.RateOperatorCallback() {
          @Override
          public void onSuccess() {
            promise.resolve(Arguments.createMap());
          }

          @Override
          public void onFailure(@NonNull WebimError<RateOperatorError> rateOperatorError) {
            handleError(promise,
              rateOperatorError.getErrorType().name(),
              rateOperatorError.getErrorString(),
              false,
              null);
          }
        });
      } else {
        handleError(promise,
          MessageStream.RateOperatorCallback.RateOperatorError.OPERATOR_NOT_IN_CHAT.name(),
          "Current operator is not present",
          false,
          null);
      }
    } catch (Exception e) {
      handleError(promise,
        FatalErrorType.UNKNOWN.name(),
        e.getLocalizedMessage(),
        true,
        e);
    }
  }

  @ReactMethod
  public void tryAttachFile(Callback failureCb, Callback successCb) {
    if (pickerPromise != null || fileCbSuccess != null) {
      failureCb.invoke(getErrorMap("ATTACHMENT_PICKER_BUSY", "A file picker is already open", false));
      return;
    }
    try {
      fileCbFailure = failureCb;
      fileCbSuccess = successCb;
      Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
      intent.setType("*/*");
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      Activity activity = reactContext.getCurrentActivity();
      if (activity != null) {
        activity.startActivityForResult(Intent.createChooser(intent, "Select a file"), FILE_SELECT_CODE);
      } else {
        WritableMap errorBody = getErrorMap("SELECT_FILE_FAILED", "File selection failed", true);
        failureCb.invoke(errorBody);
        fileCbFailure = null;
        fileCbSuccess = null;
      }
    } catch (Exception e) {
      WritableMap errorBody = getErrorMap("SELECT_FILE_FAILED", e.getLocalizedMessage(), true);
      if (fileCbFailure != null) fileCbFailure.invoke(errorBody);
      clearAttachCallbacks();
    }
  }

  @ReactMethod
  public void sendFile(String uri, String name, String mime, String extension, final Callback failureCb, final Callback successCb) {
    File file = null;
    try {
      Activity activity = getContext().getCurrentActivity();
      if (activity == null) {
        WritableMap errorBody = getErrorMap("SESSION_NULL",
          "File selection failed as session is destroyed",
          true);
        failureCb.invoke(errorBody);
        return;
      }
      InputStream inp = activity.getContentResolver().openInputStream(Uri.parse(uri));
      if (inp != null) {
        file = File.createTempFile("webim", extension, activity.getCacheDir());
        writeFully(file, inp);
      }
    } catch (IOException e) {
      if (file != null) {
        file.delete();
      }
      WritableMap errorBody = getErrorMap(MessageStream.SendFileCallback.SendFileError.UNKNOWN.name(),
        String.format(Locale.ENGLISH, "File selection failed. Details: %s", e.getLocalizedMessage()),
        true);
      failureCb.invoke(errorBody);
      return;
    }

    try {
      if (file != null && name != null) {
        final File fileToUpload = file;
        session.getStream().sendFile(fileToUpload, name, mime, new MessageStream.SendFileCallback() {
          // TODO: not implemented by SDK yet
          @Override
          public void onProgress(@NonNull Message.Id id, long sentBytes) {
            WritableMap result = Arguments.createMap();
            result.putString("id", id.toString());
            result.putDouble("bytes", (double) sentBytes);
            result.putDouble("fullSize", (double) fileToUpload.length());
            emitDeviceEvent("fileUploading", result);
          }

          @Override
          public void onSuccess(@NonNull Message.Id id) {
            fileToUpload.delete();
            successCb.invoke(getSimpleMap("id", id.toString()));
          }

          @Override
          public void onFailure(@NonNull Message.Id id,
                                @NonNull WebimError<SendFileError> error) {
            fileToUpload.delete();
            WritableMap errorBody = getErrorMap(error.getErrorType().name(),
              error.getErrorString(),
              true);
            failureCb.invoke(errorBody);
          }
        });
      } else {
        if (file != null) {
          file.delete();
        }
        WritableMap errorBody = getErrorMap(MessageStream.SendFileCallback.SendFileError.FILE_NOT_FOUND.name(),
          "File is not provided",
          true);
        failureCb.invoke(errorBody);
      }
    } catch (Exception e) {
      if (file != null) {
        file.delete();
      }
      WritableMap errorBody = getErrorMap(FatalErrorType.UNKNOWN.name(),
        e.getLocalizedMessage(),
        true);
      failureCb.invoke(errorBody);
    }
  }

  @ReactMethod
  public void getCurrentOperator(Promise promise) {
    try {
      Operator operator = session.getStream().getCurrentOperator();
      if (operator != null) {
        WritableMap operatorJson = Arguments.createMap();
        operatorJson.putString("id", operator.getId().toString());
        operatorJson.putString("name", operator.getName());
        operatorJson.putString("title", operator.getTitle());
        operatorJson.putString("info", operator.getInfo());
        operatorJson.putString("avatar", operator.getAvatarUrl());

        promise.resolve(operatorJson);
      } else {
        handleError(promise,
          MessageStream.RateOperatorCallback.RateOperatorError.OPERATOR_NOT_IN_CHAT.name(),
          "There is no operator right now",
          false,
          null);
      }
    } catch (Exception e) {
      handleError(promise,
        FatalErrorType.UNKNOWN.name(),
        "Impossible to get current operator",
        false,
        e);
    }
  }

  @Override
  public void messageAdded(@Nullable Message before, @NonNull Message message) {
    emitDeviceEvent("newMessage", messageToJson(message));
  }

  @Override
  public void messageRemoved(@NonNull Message message) {
    WritableMap payload = messageToJson(message);
    messagesById.remove(message.getClientSideId().toString());
    emitDeviceEvent("removeMessage", payload);
  }

  @Override
  public void allMessagesRemoved() {
    messagesById.clear();
    final WritableMap map = Arguments.createMap();
    emitDeviceEvent("allMessagesRemoved", map);
  }

  @Override
  public void messageChanged(@NonNull Message from, @NonNull Message to) {
    final WritableMap map = Arguments.createMap();
    map.putMap("from", messageToJson(from));
    map.putMap("to", messageToJson(to));
    emitDeviceEvent("changedMessage", map);
  }

  @Override
  public void onNotFatalError(@NonNull WebimError<NotFatalErrorType> error) {
    emitDeviceEvent("error",
      getErrorMap(error.getErrorType().toString(), error.getErrorString(), false));
  }

  @Override
  public void onError(@NonNull WebimError<FatalErrorType> error) {
    emitDeviceEvent(
      "error",
      getErrorMap(error.getErrorType().toString(), error.getErrorString(), true));
  }

  @Override
  public void updateProvidedAuthorizationToken(@NonNull String providedAuthorizationToken) {
    emitDeviceEvent("tokenUpdated", getSimpleMap("token", providedAuthorizationToken));
  }

  @Override
  public void onOnlineStatusChanged(MessageStream.OnlineStatus oldOnlineStatus, MessageStream.OnlineStatus newOnlineStatus) {
    final WritableMap map = Arguments.createMap();
    map.putString("old", oldOnlineStatus.name());
    map.putString("new", newOnlineStatus.name());
    emitDeviceEvent("onlineState", map);
  }

  @Override
  public void onUnreadByVisitorMessageCountChanged(int newMessageCount) {
    // We don't use internal method "emitEvent" as we need to pass just a number
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit("unreadCount", newMessageCount);
  }

  @Override
  public void onOperatorTypingStateChanged(boolean isTyping) {
    final WritableMap eventBody = Arguments.createMap();
    eventBody.putBoolean("isTyping", isTyping);
    emitDeviceEvent("typing", eventBody);
  }

  private static void emitDeviceEvent(String eventName, @Nullable WritableMap eventData) {
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit(eventName, eventData);
  }

  private static void handleError(final Promise promise, String errorCode, String message, boolean isFatal, @Nullable Exception e) {
    String mappedErrorCode = mapServerErrorCode(errorCode, message);
    WritableMap errorBody = getErrorMap(mappedErrorCode, message, isFatal);

    if (e != null) {
      promise.reject(mappedErrorCode, message, e, errorBody);
    } else {
      promise.reject(mappedErrorCode, message, errorBody);
    }
  }

  private WritableMap messageToJson(Message msg) {
    messagesById.put(msg.getClientSideId().toString(), msg);
    final WritableMap map = Arguments.createMap();
    map.putString("id", msg.getClientSideId().toString());
    map.putString("serverSideId", msg.getServerSideId());
    map.putDouble("time", msg.getTime());
    map.putString("type", msg.getType().toString());
    map.putString("text", msg.getText());
    map.putString("name", msg.getSenderName());
    map.putString("status", msg.getSendStatus().toString());
    map.putString("avatar", msg.getSenderAvatarUrl());
    map.putBoolean("read", msg.isReadByOperator());
    map.putBoolean("canEdit", msg.canBeEdited());
    map.putBoolean("canReply", msg.canBeReplied());
    map.putBoolean("isEdited", msg.isEdited());

    map.putBoolean("canReact", msg.canVisitorReact());
    map.putBoolean("canChangeReaction", msg.canVisitorChangeReaction());
    if (msg.getReaction() != null) {
      map.putString("visitorReaction", msg.getReaction().name());
    }
    if (msg.getSticker() != null) {
      map.putInt("stickerId", msg.getSticker().getStickerId());
    }
    Message.Keyboard keyboard = msg.getKeyboard();
    if (keyboard != null) {
      WritableArray rows = Arguments.createArray();
      for (List<Message.KeyboardButton> keyboardRow : keyboard.getButtons()) {
        WritableArray row = Arguments.createArray();
        for (Message.KeyboardButton button : keyboardRow) {
          WritableMap item = Arguments.createMap();
          item.putString("id", button.getId());
          item.putString("text", button.getText());
          row.pushMap(item);
        }
        rows.pushArray(row);
      }
      WritableMap keyboardMap = Arguments.createMap();
      keyboardMap.putArray("buttons", rows);
      keyboardMap.putString("state", keyboard.getState().name());
      if (keyboard.getKeyboardResponse() != null) {
        keyboardMap.putString("response", keyboard.getKeyboardResponse().getButtonId());
      }
      map.putMap("keyboard", keyboardMap);
    }
    Message.KeyboardRequest keyboardRequest = msg.getKeyboardRequest();
    if (keyboardRequest != null) {
      WritableMap request = Arguments.createMap();
      Message.KeyboardButton button = keyboardRequest.getButtons();
      if (button != null) {
        WritableMap buttonMap = Arguments.createMap();
        buttonMap.putString("id", button.getId());
        buttonMap.putString("text", button.getText());
        request.putMap("button", buttonMap);
      }
      request.putString("messageId", keyboardRequest.getMessageId());
      map.putMap("keyboardRequest", request);
    }
    if (msg.getOperatorId() != null) {
      map.putString("operatorId", msg.getOperatorId().toString());
    }

    Message.Attachment attach = msg.getAttachment();
    if (attach != null) {
      WritableArray attachments = Arguments.createArray();
      List<Message.FileInfo> files = attach.getFilesInfo();
      if (files != null) {
        for (Message.FileInfo file : files) attachments.pushMap(mapAttachmentToJson(file));
      }
      if (files != null && !files.isEmpty()) map.putMap("attachment", mapAttachmentToJson(files.get(0)));
      map.putArray("attachments", attachments);
    }

    Message.Quote quote = msg.getQuote();
    if (quote != null) {
      WritableMap _att = Arguments.createMap();
      _att.putString("senderName", quote.getSenderName());
      _att.putString("messageId", quote.getMessageId());
      _att.putString("messageText", quote.getMessageText());
      _att.putString("messageType", quote.getMessageType().name());
      _att.putString("state", quote.getState().name());
      _att.putString("timestamp", String.valueOf(quote.getMessageTimestamp()));
      if (quote.getMessageAttachment() != null) {
        _att.putMap("attachment", mapAttachmentToJson(quote.getMessageAttachment()));
      }

      map.putMap("quote", _att);
    }

    return map;
  }

  private WritableMap mapAttachmentToJson(Message.FileInfo fileInfo) {
    WritableMap _att = Arguments.createMap();
    _att.putString("contentType", fileInfo.getContentType());
    _att.putString("name", fileInfo.getFileName());
    _att.putString("info", "fileInfo.getImageInfo().toString()");
    _att.putDouble("size", fileInfo.getSize());
    _att.putString("url", fileInfo.getUrl());

    return _att;
  }

  private static WritableMap getSimpleMap(String key, String value) {
    WritableMap map = Arguments.createMap();
    map.putString(key, value);
    return map;
  }

  private static WritableMap getErrorMap(String errorCode, String message, Boolean isFatal) {
    WritableMap errorBody = getSimpleMap("message", message);
    errorBody.putString("errorCode", mapServerErrorCode(errorCode, message));
    errorBody.putString("errorType", isFatal ? "fatal" : "common");

    return errorBody;
  }

  private static String mapServerErrorCode(String errorCode, String message) {
    String serverError = message == null ? "" : message.toLowerCase(Locale.ROOT);
    if (serverError.contains("wrong-argument-value")) return "INVALID_ARGUMENT_VALUE";
    if (serverError.contains("account-not-found")) return "ACCOUNT_NOT_FOUND";
    return errorCode == null || errorCode.isEmpty() ? "UNKNOWN" : errorCode;
  }

  private void clearAttachCallbacks() {
    fileCbFailure = null;
    fileCbSuccess = null;
  }

  private void clearAttachmentState() {
    attachmentGeneration++;
    // A failed send callback does not prove the server did not commit the group.
    for (Map.Entry<String, UploadedFile> entry : uploadedFiles.entrySet()) {
      if (session != null && !busyUploadHandles.contains(entry.getKey()) && !attemptedCommitHandles.contains(entry.getKey())) {
        try { session.getStream().deleteUploadedFile(entry.getValue().getGuid(), null); } catch (Exception ignored) {}
      }
    }
    for (Promise pending : attachmentOperations.values()) pending.reject("SESSION_DESTROYED", "Attachment operation interrupted by session destruction");
    attachmentOperations.clear();
    attachmentCallbacks.clear();
    uploadedFiles.clear();
    busyUploadHandles.clear();
    attemptedCommitHandles.clear();
    for (File copy : uploadCopies.values()) copy.delete();
    uploadCopies.clear();
    for (File copy : pickerCopies) copy.delete();
    pickerCopies.clear();
    finishPickerFailure("SESSION_DESTROYED", "Attachment selection interrupted by session destruction");
    if (fileCbFailure != null) fileCbFailure.invoke(getErrorMap("SESSION_DESTROYED", "Attachment selection interrupted by session destruction", false));
    clearAttachCallbacks();
  }

  private static void writeFully(@NonNull File to, @NonNull InputStream from) throws IOException {
    byte[] buffer = new byte[4096];
    OutputStream out = null;
    try {
      out = new FileOutputStream(to);
      for (int read; (read = from.read(buffer)) != -1; ) {
        out.write(buffer, 0, read);
      }
    } finally {
      from.close();
      if (out != null) {
        out.close();
      }
    }
  }

  private WritableArray messagesToJson(@NonNull List<? extends Message> messages) {
    WritableArray jsonMessages = Arguments.createArray();
    for (Message message : messages) {
      jsonMessages.pushMap(messageToJson(message));
    }
    return jsonMessages;
  }

  private MessageTracker.GetMessagesCallback getMessagesCallback(Promise promise) {
    return messages -> {
      WritableArray response = messagesToJson(messages);
      promise.resolve(response);
    };
  }
}
