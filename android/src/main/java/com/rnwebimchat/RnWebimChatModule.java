package com.rnwebimchat;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.MimeTypeMap;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
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
import java.util.Map;

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

@ReactModule(name = RnWebimChatModule.NAME)
public class RnWebimChatModule extends ReactContextBaseJavaModule implements
  MessageListener, ProvidedAuthorizationTokenStateListener, FatalErrorHandler, NotFatalErrorHandler, MessageStream.OnlineStatusChangeListener {
  public static final String NAME = "RnWebimChat";
  private static final int FILE_SELECT_CODE = 0;
  private static ReactApplicationContext reactContext = null;

  private Callback fileCbSuccess;
  private Callback fileCbFailure;
  private MessageTracker tracker;
  private WebimSession session;



  public RnWebimChatModule(ReactApplicationContext context) {
    super(context);
    reactContext = context;

    // todo: чистить cb
    ActivityEventListener mActivityEventListener = new BaseActivityEventListener() {
      @Override
      public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_SELECT_CODE) {
          if (resultCode == Activity.RESULT_OK) {
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
                _data.putString("name", name);
                _data.putString("mime", mime);
                _data.putString("extension", extension);
                fileCbSuccess.invoke(_data);
              }
            } else {
              fileCbFailure.invoke(getSimpleMap("message", "unknown"));
            }
            clearAttachCallbacks();
            return;
          }
          if (resultCode != Activity.RESULT_CANCELED) {
            if (fileCbFailure != null) {
              fileCbFailure.invoke(getSimpleMap("message", "canceled"));
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

  private void init(String accountName, String location, @Nullable String accountJSON, @Nullable String providedAuthorizationToken, @Nullable String appVersion, @Nullable Boolean clearVisitorData, @Nullable Boolean storeHistoryLocally, @Nullable String title, @Nullable String pushToken) {
    Webim.SessionBuilder builder = Webim.newSessionBuilder()
      .setContext(reactContext)
      .setAccountName(accountName)
      .setLocation(location)
      .setErrorHandler(this)
      .setNotFatalErrorHandler(this)
      .setPushSystem(Webim.PushSystem.FCM);
    if (pushToken != null) {
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
    if (providedAuthorizationToken != null) {
      builder.setProvidedAuthorizationTokenStateListener(this, providedAuthorizationToken);
    }
    session = builder.build();
  }

  @ReactMethod
  public void resumeSession(ReadableMap builderData, final Callback errorCallback, final Callback successCallback) {
    String accountName = builderData.getString("accountName");
    String location = builderData.getString("location");

    // optional
    String accountJSON = builderData.hasKey("accountJSON") ? builderData.getString("accountJSON") : null;
    String providedAuthorizationToken = builderData.hasKey("providedAuthorizationToken") ? builderData.getString("providedAuthorizationToken") : null;
    String appVersion = builderData.hasKey("appVersion") ? builderData.getString("appVersion") : null;
    Boolean clearVisitorData = builderData.hasKey("clearVisitorData") ? builderData.getBoolean("clearVisitorData") : null;
    Boolean storeHistoryLocally = builderData.hasKey("storeHistoryLocally") ? builderData.getBoolean("storeHistoryLocally") : null;
    String title = builderData.hasKey("title") ? builderData.getString("title") : null;
    String pushToken = builderData.hasKey("pushToken") ? builderData.getString("pushToken") : null;

    if (session == null) {
      init(accountName, location, accountJSON, providedAuthorizationToken, appVersion, clearVisitorData, storeHistoryLocally, title, pushToken);
    }

    if (session == null) {
      WritableMap errorBody = Arguments.createMap();
      errorBody.putString("message", "Resume null session");
      errorBody.putString("errorCode", "NULL_SESSION");
      errorBody.putString("errorType", "fatal");
      errorCallback.invoke(getSimpleMap("message", "resume null session"));
    }
    session.resume();
    session.getStream().startChat();
    session.getStream().setChatRead();
    tracker = session.getStream().newMessageTracker(this);
    successCallback.invoke(Arguments.createMap());
  }

  @ReactMethod
  public void destroySession(Boolean clearData, final Callback errorCallback, final Callback successCallback) {
    if (session != null) {
      session.getStream().closeChat();
      tracker.destroy();
      if (clearData) {
        session.destroyWithClearVisitorData();
      } else {
        session.destroy();
      }
      session = null;
    }
    successCallback.invoke(Arguments.createMap());
  }

  @ReactMethod
  public void getLastMessages(int limit, final Callback errorCallback, final Callback successCallback) {
    try {
      tracker.getLastMessages(limit, getMessagesCallback(successCallback));
    } catch (NullPointerException e) {
      WritableMap errorBody = Arguments.createMap();
      errorBody.putString("message", "Can not read all messages");
      errorBody.putString("errorCode", "NULL_SESSION");
      errorBody.putString("errorType", "fatal");
      errorCallback.invoke(errorBody);
    } catch (Exception e) {
      WritableMap errorBody = Arguments.createMap();
      errorBody.putString("message", "Can not get last messages");
      errorBody.putString("errorCode", FatalErrorType.UNKNOWN.name());
      errorBody.putString("errorType", "fatal");
      errorCallback.invoke(errorBody);
    }
  }

  @ReactMethod
  public void getNextMessages(int limit, final Callback errorCallback, final Callback successCallback) {
    try {
      tracker.getNextMessages(limit, getMessagesCallback(successCallback));
    } catch (NullPointerException e) {
      WritableMap errorBody = Arguments.createMap();
      errorBody.putString("message", "Can not get next messages");
      errorBody.putString("errorCode", "NULL_SESSION");
      errorBody.putString("errorType", "fatal");
      errorCallback.invoke(errorBody);
    } catch (Exception e) {
      WritableMap errorBody = Arguments.createMap();
      errorBody.putString("message", "Can not read all messages");
      errorBody.putString("errorCode", FatalErrorType.UNKNOWN.name());
      errorBody.putString("errorType", "fatal");
      errorCallback.invoke(errorBody);
    }
  }

  @ReactMethod
  public void getAllMessages(final Callback errorCallback, final Callback successCallback) {
    try {
      tracker.getAllMessages(getMessagesCallback(successCallback));
    } catch (NullPointerException e) {
      WritableMap errorBody = Arguments.createMap();
      errorBody.putString("message", "Can not read all messages");
      errorBody.putString("errorCode", "NULL_SESSION");
      errorBody.putString("errorType", "fatal");
      errorCallback.invoke(errorBody);
    } catch (Exception e) {
      WritableMap errorBody = Arguments.createMap();
      errorBody.putString("message", "Can not read all messages");
      errorBody.putString("errorCode", FatalErrorType.UNKNOWN.name());
      errorBody.putString("errorType", "fatal");
      errorCallback.invoke(errorBody);
    }
  }

  @ReactMethod
  public void rateOperator(int rate, final Callback errorCallback, final Callback successCallback) {
    Operator operator = session.getStream().getCurrentOperator();
    if (operator != null) {
      session.getStream().rateOperator(operator.getId(), rate, new MessageStream.RateOperatorCallback() {
        @Override
        public void onSuccess() {
          successCallback.invoke(Arguments.createMap());
        }

        @Override
        public void onFailure(@NonNull WebimError<RateOperatorError> rateOperatorError) {
          WritableMap errorBody = Arguments.createMap();
          errorBody.putString("message", rateOperatorError.getErrorString());
          errorBody.putString("errorCode", rateOperatorError.getErrorType().name());
          errorBody.putString("errorType", "fatal");
          errorCallback.invoke(errorBody);
        }
      });
    } else {
      WritableMap errorBody = Arguments.createMap();
      errorBody.putString("message", "no operator");
      errorBody.putString("errorCode", MessageStream.RateOperatorCallback.RateOperatorError.OPERATOR_NOT_IN_CHAT.name());
      errorBody.putString("errorType", "common");
      errorCallback.invoke(errorBody);
    }
  }

  @ReactMethod
  public void tryAttachFile(Callback failureCb, Callback successCb) {
    fileCbFailure = failureCb;
    fileCbSuccess = successCb;
    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
    intent.setType("*/*");
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    Activity activity = reactContext.getCurrentActivity();
    if (activity != null) {
      activity.startActivityForResult(Intent.createChooser(intent, "Выбор файла"), FILE_SELECT_CODE);
    } else {
      failureCb.invoke("pick error");
      fileCbFailure = null;
      fileCbSuccess = null;
    }
  }

  @ReactMethod
  public void sendFile(String uri, String name, String mime, String extension, final Callback failureCb, final Callback successCb) {
    File file = null;
    try {
      Activity activity = getContext().getCurrentActivity();
      if (activity == null) {
        failureCb.invoke("");
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
      failureCb.invoke(getSimpleMap("message", "unknown"));
      return;
    }
    if (file != null && name != null) {
      final File fileToUpload = file;
      session.getStream().sendFile(fileToUpload, name, mime, new MessageStream.SendFileCallback() {
        @Override
        public void onProgress(@NonNull Message.Id id, long sentBytes) {
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
          String msg;
          switch (error.getErrorType()) {
            case FILE_TYPE_NOT_ALLOWED:
              msg = "type not allowed";
              break;
            case FILE_SIZE_EXCEEDED:
              msg = "file size exceeded";
              break;
            default:
              msg = "unknown";
          }
          failureCb.invoke(getSimpleMap("message", msg));
        }
      });
    } else {
      failureCb.invoke(getSimpleMap("message", "no file"));
    }
  }

  @ReactMethod
  public void send(String message, final Callback failureCb, final Callback successCb) {
    try {
      session.getStream().sendMessage(message);
      successCb.invoke();
    } catch (NullPointerException e) {
      WritableMap errorBody = Arguments.createMap();
      errorBody.putString("message", "Can not send message");
      errorBody.putString("errorCode", "NULL_SESSION");
      errorBody.putString("errorType", "fatal");
      failureCb.invoke(errorBody);
    } catch (Exception e) {
      WritableMap errorBody = Arguments.createMap();
      errorBody.putString("message", "Can not send message");
      errorBody.putString("errorCode", FatalErrorType.UNKNOWN.name());
      errorBody.putString("errorType", "fatal");
      failureCb.invoke(errorBody);
    }
  }

  @Override
  public void onError(@NonNull WebimError<FatalErrorType> error) {
    WritableMap errorBody = Arguments.createMap();
    errorBody.putString("message", error.getErrorString());
    errorBody.putString("errorCode", error.getErrorType().name());
    errorBody.putString("errorType", "fatal");
    emitDeviceEvent("error", errorBody);
  }

  @Override
  public void messageAdded(@Nullable Message before, @NonNull Message message) {
    final WritableMap msg = Arguments.createMap();
    msg.putMap("msg", messageToJson(message));
    emitDeviceEvent("newMessage", msg);
  }

  @Override
  public void messageRemoved(@NonNull Message message) {
    final WritableMap msg = Arguments.createMap();
    msg.putMap("msg", messageToJson(message));
    emitDeviceEvent("removeMessage", msg);
  }

  @Override
  public void messageChanged(@NonNull Message from, @NonNull Message to) {
    final WritableMap map = Arguments.createMap();
    map.putMap("to", messageToJson(to));
    map.putMap("from", messageToJson(from));
    emitDeviceEvent("changedMessage", map);
  }

  @Override
  public void allMessagesRemoved() {
    final WritableMap map = Arguments.createMap();
    emitDeviceEvent("allMessagesRemoved", map);
  }

  @Override
  public void onNotFatalError(@NonNull WebimError<NotFatalErrorType> error) {
    WritableMap errorBody = Arguments.createMap();
    errorBody.putString("message", error.getErrorString());
    errorBody.putString("errorCode", error.getErrorType().name());
    errorBody.putString("errorType", "common");
    emitDeviceEvent("error", errorBody);
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

  private static void emitDeviceEvent(String eventName, @Nullable WritableMap eventData) {
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit(eventName, eventData);
  }

  private WritableMap messageToJson(Message msg) {
    final WritableMap map = Arguments.createMap();
    map.putString("id", msg.getClientSideId().toString());
    map.putDouble("time", msg.getTime());
    map.putString("type", msg.getType().toString());
    map.putString("text", msg.getText());
    map.putString("name", msg.getSenderName());
    map.putString("status", msg.getSendStatus().toString());
    map.putString("avatar", msg.getSenderAvatarUrl());
    map.putBoolean("read", msg.isReadByOperator());
    map.putBoolean("canEdit", msg.canBeEdited());
    map.putBoolean("canReply", msg.canBeReplied());
    map.putString("serverId", msg.getServerSideId());
    Message.Attachment attach = msg.getAttachment();
    if (attach != null) {
      WritableMap _att = Arguments.createMap();
      Message.FileInfo fileInfo = attach.getFileInfo();
      _att.putString("contentType", fileInfo.getContentType());
      _att.putString("name", fileInfo.getFileName());
      _att.putString("info", "fileInfo.getImageInfo().toString()");
      _att.putDouble("size", fileInfo.getSize());
      _att.putString("url", fileInfo.getUrl());
      map.putMap("attachment", _att);
    }

    Message.Quote quote = msg.getQuote();
    if (quote != null) {
      WritableMap _att = Arguments.createMap();
      _att.putString("authorId", quote.getAuthorId());
      _att.putString("senderName", quote.getSenderName());
      _att.putString("messageId", quote.getMessageId());
      _att.putString("messageText", quote.getMessageText());
      _att.putString("messageType", quote.getMessageType().name());
      _att.putString("state", quote.getState().name());
      map.putMap("quote", _att);
    }

    return map;
  }

  private WritableMap getSimpleMap(String key, String value) {
    WritableMap map = Arguments.createMap();
    map.putString(key, value);
    return map;
  }

  private void clearAttachCallbacks() {
    fileCbFailure = null;
    fileCbSuccess = null;
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

  private WritableMap messagesToJson(@NonNull List<? extends Message> messages) {
    WritableMap response = Arguments.createMap();
    WritableArray jsonMessages = Arguments.createArray();
    for (Message message : messages) {
      jsonMessages.pushMap(messageToJson(message));
    }
    response.putArray("messages", jsonMessages);
    return response;
  }

  private MessageTracker.GetMessagesCallback getMessagesCallback(final Callback successCallback) {
    return new MessageTracker.GetMessagesCallback() {
      @Override
      public void receive(@NonNull List<? extends Message> messages) {
        WritableMap response = messagesToJson(messages);
        successCallback.invoke(response);
      }
    };
  }
}
