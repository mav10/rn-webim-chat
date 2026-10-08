package ru.webim.android.sdk.impl.backend;

import static org.junit.Assert.*;

import com.google.gson.Gson;
import com.rnwebimchat.SafeUploadedFileResponse;
import java.util.concurrent.atomic.AtomicReference;
import okhttp3.MediaType;
import okhttp3.RequestBody;
import okio.Buffer;
import org.junit.Test;
import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;
import ru.webim.android.sdk.Message;
import ru.webim.android.sdk.MessageStream;
import ru.webim.android.sdk.UploadedFile;
import ru.webim.android.sdk.WebimError;
import ru.webim.android.sdk.impl.StringId;
import ru.webim.android.sdk.impl.backend.callbacks.SendOrDeleteMessageInternalCallback;
import ru.webim.android.sdk.impl.items.responses.UploadResponse;

public class GroupedUploadTransportEvidenceTest {
  private static final String DATA = "{\"size\":12,\"guid\":\"file-guid\",\"filename\":\"sample.txt\","
    + "\"content_type\":\"text/plain\",\"visitor_id\":\"visitor\",\"client_content_type\":\"text/plain\"}";

  @Test
  public void uploadPreservesFullMetadataAndLegacySendStillReturnsGuid() throws Exception {
    AtomicReference<ActionRequestLoop.WebimRequest<?>> queued = new AtomicReference<>();
    ActionRequestLoop loop = new ActionRequestLoop(Runnable::run, null) {
      @Override
      public void enqueue(ActionRequestLoop.WebimRequest<?> request) {
        queued.set(request);
      }
    };
    WebimService service = new Retrofit.Builder().baseUrl("https://example.invalid/")
      .addConverterFactory(GsonConverterFactory.create()).build().create(WebimService.class);
    WebimActionsImpl actions = new WebimActionsImpl(service, loop, loop, null);
    AtomicReference<String> callbackValue = new AtomicReference<>();
    SendOrDeleteMessageInternalCallback callback = new SendOrDeleteMessageInternalCallback() {
        @Override
        public void onSuccess(String response) {
          callbackValue.set(response);
        }

        @Override
        public void onFailure(String error) {
          fail(error);
        }
      };
    RequestBody fileBody = RequestBody.create(MediaType.parse("text/plain"), "hello world!");
    actions.uploadFileToServer(fileBody, "sample.txt", "client-id", callback);
    ActionRequestLoop.WebimRequest<?> request = queued.get();
    assertNotNull(request);
    okhttp3.Request httpRequest = request.makeRequest(new AuthData("page-id", "token", null)).request();
    assertEquals("POST", httpRequest.method());
    assertEquals("/l/v/m/upload", httpRequest.url().encodedPath());
    Buffer body = new Buffer();
    httpRequest.body().writeTo(body);
    String multipart = body.readUtf8();
    assertTrue(multipart.contains("name=\"chat-mode\"\r\n"));
    assertTrue(multipart.contains("\r\n\r\nonline\r\n"));
    assertTrue(multipart.contains("name=\"webim_upload_file\"; filename=\"sample.txt\""));
    assertTrue(multipart.contains("Content-Type: text/plain"));
    assertTrue(multipart.contains("\r\n\r\nhello world!\r\n"));
    assertTrue(multipart.contains("name=\"client-side-id\"\r\n"));
    assertTrue(multipart.contains("\r\n\r\nclient-id\r\n"));
    assertTrue(multipart.contains("name=\"page-id\"\r\n"));
    assertTrue(multipart.contains("\r\n\r\npage-id\r\n"));
    assertTrue(multipart.contains("name=\"auth-token\"\r\n"));
    assertTrue(multipart.contains("\r\n\r\ntoken\r\n"));
    assertFalse(multipart.contains("is_preliminary"));
    assertFalse(multipart.contains("upload-only"));

    @SuppressWarnings("unchecked")
    ActionRequestLoop.WebimRequest<UploadResponse> uploadRequest =
      (ActionRequestLoop.WebimRequest<UploadResponse>) request;
    uploadRequest.runCallback(new Gson().fromJson("{\"data\":" + DATA + "}", UploadResponse.class));
    assertEquals(new Gson().fromJson(DATA, com.google.gson.JsonObject.class),
      new Gson().fromJson(callbackValue.get(), com.google.gson.JsonObject.class));

    AtomicReference<UploadedFile> uploaded = new AtomicReference<>();
    SafeUploadedFileResponse.deliver(callbackValue.get(), StringId.generateForMessage(),
      new MessageStream.UploadFileToServerCallback() {
        @Override
        public void onSuccess(Message.Id id, UploadedFile file) {
          uploaded.set(file);
        }

        @Override
        public void onFailure(Message.Id id, WebimError<MessageStream.SendFileCallback.SendFileError> error) {
          fail(error.getErrorString());
        }
      });
    assertEquals("file-guid", uploaded.get().getGuid());
    assertEquals("sample.txt", uploaded.get().getFileName());
    assertEquals(12, uploaded.get().getSize());
    assertEquals("visitor", uploaded.get().getVisitorId());

    actions.sendFile(fileBody, "sample.txt", "client-id", callback);
    ActionRequestLoop.WebimRequest<?> legacyRequest = queued.get();
    okhttp3.Request legacyHttp = legacyRequest.makeRequest(new AuthData("page-id", "token", null)).request();
    assertEquals(httpRequest.url(), legacyHttp.url());
    assertEquals(httpRequest.method(), legacyHttp.method());
    Buffer legacyBody = new Buffer();
    legacyHttp.body().writeTo(legacyBody);
    String legacyMultipart = legacyBody.readUtf8();
    assertEquals(multipart.replace(((okhttp3.MultipartBody) httpRequest.body()).boundary(), "BOUNDARY"),
      legacyMultipart.replace(((okhttp3.MultipartBody) legacyHttp.body()).boundary(), "BOUNDARY"));
    @SuppressWarnings("unchecked")
    ActionRequestLoop.WebimRequest<UploadResponse> legacyUpload =
      (ActionRequestLoop.WebimRequest<UploadResponse>) legacyRequest;
    legacyUpload.runCallback(new Gson().fromJson("{\"data\":" + DATA + "}", UploadResponse.class));
    assertEquals("file-guid", callbackValue.get());
  }

  @Test
  public void uploadRetainsBackendErrorCallbackContract() {
    AtomicReference<ActionRequestLoop.WebimRequest<?>> queued = new AtomicReference<>();
    ActionRequestLoop loop = new ActionRequestLoop(Runnable::run, null) {
      @Override
      public void enqueue(ActionRequestLoop.WebimRequest<?> request) {
        queued.set(request);
      }
    };
    AtomicReference<String> failure = new AtomicReference<>();
    WebimActionsImpl actions = new WebimActionsImpl(null, loop, loop, null);
    actions.uploadFileToServer(RequestBody.create(MediaType.parse("text/plain"), "hello world!"),
      "sample.txt", "client-id", new SendOrDeleteMessageInternalCallback() {
        @Override
        public void onSuccess(String response) {
          fail("Failed upload must not succeed");
        }

        @Override
        public void onFailure(String error) {
          failure.set(error);
        }
      });
    assertTrue(queued.get().isHandleError("file-size-exceeded"));
    queued.get().handleError("file-size-exceeded");
    assertEquals("file-size-exceeded", failure.get());
  }

  @Test
  public void uploadWithoutCallbackKeepsOptionalAuthAndCallbackContract() throws Exception {
    AtomicReference<ActionRequestLoop.WebimRequest<?>> queued = new AtomicReference<>();
    ActionRequestLoop loop = new ActionRequestLoop(Runnable::run, null) {
      @Override
      public void enqueue(ActionRequestLoop.WebimRequest<?> request) {
        queued.set(request);
      }
    };
    WebimService service = new Retrofit.Builder().baseUrl("https://example.invalid/")
      .addConverterFactory(GsonConverterFactory.create()).build().create(WebimService.class);
    WebimActionsImpl actions = new WebimActionsImpl(service, loop, loop, null);
    actions.uploadFileToServer(RequestBody.create(MediaType.parse("text/plain"), "hello world!"),
      "sample.txt", "client-id", null);
    Buffer body = new Buffer();
    queued.get().makeRequest(new AuthData("page-id", null, null)).request().body().writeTo(body);
    assertFalse(body.readUtf8().contains("name=\"auth-token\""));
    assertFalse(queued.get().isHandleError("file-size-exceeded"));
    queued.get().handleError("file-size-exceeded");
    @SuppressWarnings("unchecked")
    ActionRequestLoop.WebimRequest<UploadResponse> request =
      (ActionRequestLoop.WebimRequest<UploadResponse>) queued.get();
    request.runCallback(null);
  }
}