package ru.webim.android.sdk.impl;

import static org.junit.Assert.*;

import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;
import com.rnwebimchat.SafeUploadedFileResponse;
import java.io.File;
import java.lang.reflect.Proxy;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import ru.webim.android.sdk.Message;
import ru.webim.android.sdk.MessageStream;
import ru.webim.android.sdk.UploadedFile;
import ru.webim.android.sdk.WebimError;
import ru.webim.android.sdk.impl.backend.WebimActions;
import ru.webim.android.sdk.impl.backend.callbacks.SendOrDeleteMessageInternalCallback;

public class UploadResponsePatchTest {
  private static final String OBJECT = "{\"size\":12,\"guid\":\"file-guid\",\"filename\":\"sample.txt\","
    + "\"content_type\":\"text/plain\",\"visitor_id\":\"visitor\",\"client_content_type\":\"text/plain\"}";

  private static final class UploadHarness implements MessageStream.UploadFileToServerCallback {
    SendOrDeleteMessageInternalCallback pending;
    Message.Id requestedId;
    Message.Id deliveredId;
    UploadedFile uploaded;
    WebimError<MessageStream.SendFileCallback.SendFileError> failure;
    int successes;
    int failures;
    int requests;
    int commits;

    UploadHarness() {
      WebimActions actions = (WebimActions) Proxy.newProxyInstance(WebimActions.class.getClassLoader(),
        new Class<?>[]{WebimActions.class}, (proxy, method, arguments) -> {
          if ("sendFile".equals(method.getName())) fail("Upload must not use the legacy GUID callback");
          if ("uploadFileToServer".equals(method.getName())) {
            requests++;
            pending = (SendOrDeleteMessageInternalCallback) arguments[3];
          }
          if ("sendFiles".equals(method.getName())) commits++;
          return null;
        });
      MessageStreamImpl stream = new MessageStreamImpl("https://example.invalid", null, null, null,
        null, AccessChecker.EMPTY, actions, null, null, null, "mobile", null, null, null);
      requestedId = stream.uploadFileToServer(new File("unused.txt"), "sample.txt", "text/plain", this);
      assertNotNull(pending);
      assertEquals(0, successes);
      assertEquals(0, failures);
    }

    void respond(String response) throws Exception {
      ExecutorService executor = Executors.newSingleThreadExecutor();
      try {
        executor.submit(() -> pending.onSuccess(response)).get(5, TimeUnit.SECONDS);
      } finally {
        executor.shutdownNow();
      }
      assertSame(requestedId, deliveredId);
      assertEquals(1, successes + failures);
      assertEquals(1, requests);
      assertEquals(0, commits);
    }

    @Override
    public void onSuccess(Message.Id id, UploadedFile file) {
      deliveredId = id;
      uploaded = file;
      successes++;
    }

    @Override
    public void onFailure(Message.Id id, WebimError<MessageStream.SendFileCallback.SendFileError> error) {
      deliveredId = id;
      failure = error;
      failures++;
    }
  }

  @Test
  public void originalSdkParserReproducesReportedStringCrash() {
    JsonSyntaxException error = assertThrows(JsonSyntaxException.class,
      () -> InternalUtils.getUploadedFile(new Gson().toJson(OBJECT)));
    assertTrue(error.getMessage().contains("Expected BEGIN_OBJECT but was STRING"));
  }

  @Test
  public void actualAsyncCallbackAcceptsObjectAndEncodedObject() throws Exception {
    for (String response : new String[]{OBJECT, new Gson().toJson(OBJECT)}) {
      UploadHarness harness = new UploadHarness();
      harness.respond(response);
      assertEquals(1, harness.successes);
      assertNull(harness.failure);
      assertEquals("file-guid", harness.uploaded.getGuid());
      assertEquals("sample.txt", harness.uploaded.getFileName());
      assertEquals(12, harness.uploaded.getSize());
      assertEquals("visitor", harness.uploaded.getVisitorId());
    }
  }

  @Test
  public void actualAsyncCallbackRejectsOtherResponsesWithoutThrowing() throws Exception {
    String[] responses = {null, "", "null", "true", "42", "[]", "{}", "{broken", "\"unsupported\"",
      new Gson().toJson(new Gson().toJson(OBJECT)),
      OBJECT.replace("12", "-1"), OBJECT.replace("12", "1.5"),
      OBJECT.replace("12", "9223372036854775808"), OBJECT.replace("\"file-guid\"", "null"),
      OBJECT.replace("\"visitor\"", "7"), OBJECT.replace("12", "\"12\""),
      OBJECT.replace("}", ",\"image\":\"invalid\"}")};
    for (String response : responses) {
      UploadHarness harness = new UploadHarness();
      harness.respond(response);
      assertEquals("Response: " + response, 1, harness.failures);
      assertNull(harness.uploaded);
      assertTrue(harness.failure instanceof SafeUploadedFileResponse.InvalidUploadResponseError);
      assertEquals("INVALID_UPLOAD_RESPONSE",
        ((SafeUploadedFileResponse.InvalidUploadResponseError) harness.failure).getCode());
    }
  }

  @Test
  public void actualAsyncTransportFailureRetainsSdkError() {
    UploadHarness harness = new UploadHarness();
    harness.pending.onFailure("file-size-exceeded");
    assertEquals(1, harness.failures);
    assertFalse(harness.failure instanceof SafeUploadedFileResponse.InvalidUploadResponseError);
    assertEquals("file-size-exceeded", harness.failure.getErrorString());
  }

  @Test
  public void consumerCallbackExceptionsAreNotMisclassifiedAsParseFailures() {
    MessageStream.UploadFileToServerCallback callback = new MessageStream.UploadFileToServerCallback() {
      @Override
      public void onSuccess(Message.Id id, UploadedFile file) {
        throw new IllegalStateException("consumer callback");
      }

      @Override
      public void onFailure(Message.Id id, WebimError<MessageStream.SendFileCallback.SendFileError> error) {
        fail("Consumer exceptions must not produce a second callback");
      }
    };
    IllegalStateException error = assertThrows(IllegalStateException.class,
      () -> SafeUploadedFileResponse.deliver(OBJECT, StringId.generateForMessage(), callback));
    assertEquals("consumer callback", error.getMessage());
  }
}