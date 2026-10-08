package com.rnwebimchat;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import ru.webim.android.sdk.Message;
import ru.webim.android.sdk.MessageStream;
import ru.webim.android.sdk.UploadedFile;
import ru.webim.android.sdk.impl.InternalUtils;
import ru.webim.android.sdk.impl.WebimErrorImpl;

public final class SafeUploadedFileResponse {
  private SafeUploadedFileResponse() {}

  public static final class InvalidUploadResponseError extends WebimErrorImpl<MessageStream.SendFileCallback.SendFileError> {
    public InvalidUploadResponseError() {
      super(MessageStream.SendFileCallback.SendFileError.UNKNOWN, "Invalid grouped attachment upload response");
    }

    public String getCode() {
      return "INVALID_UPLOAD_RESPONSE";
    }
  }

  public static void deliver(String response, Message.Id id, MessageStream.UploadFileToServerCallback callback) {
    final UploadedFile file;
    try {
      file = parse(response);
    } catch (RuntimeException error) {
      callback.onFailure(id, new InvalidUploadResponseError());
      return;
    }
    callback.onSuccess(id, file);
  }

  static UploadedFile parse(String response) {
    if (response == null) throw new IllegalArgumentException("Missing upload response");
    JsonElement value = JsonParser.parseString(response);
    if (value.isJsonPrimitive() && value.getAsJsonPrimitive().isString()) {
      value = JsonParser.parseString(value.getAsString());
    }
    if (!value.isJsonObject()) throw new IllegalArgumentException("Upload response must be an object");
    JsonObject object = value.getAsJsonObject();
    requireString(object, "guid");
    requireString(object, "filename");
    requireString(object, "content_type");
    requireString(object, "visitor_id");
    requireString(object, "client_content_type");
    JsonElement size = object.get("size");
    if (size == null || !size.isJsonPrimitive() || !size.getAsJsonPrimitive().isNumber() ||
        size.getAsBigDecimal().signum() <= 0) {
      throw new IllegalArgumentException("Upload size must be positive");
    }
    size.getAsBigDecimal().longValueExact();
    return InternalUtils.getUploadedFile(object.toString());
  }

  private static void requireString(JsonObject object, String name) {
    JsonElement value = object.get(name);
    if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString() ||
        value.getAsString().trim().isEmpty()) {
      throw new IllegalArgumentException("Missing upload metadata: " + name);
    }
  }
}