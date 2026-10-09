import WebimMobileSDK
import Foundation
import UniformTypeIdentifiers
import PhotosUI

private final class RnWebimAttachmentCompletionHandler: NSObject, UploadFileToServerCompletionHandler, SendFilesCompletionHandler, DeleteUploadedFileCompletionHandler {
    var uploaded: ((UploadedFile) -> Void)?
    var sent: ((String) -> Void)?
    var deleted: (() -> Void)?
    var failed: ((Error) -> Void)?

    func onSuccess(id: String, uploadedFile: UploadedFile) { uploaded?(uploadedFile) }
    func onSuccess(messageID: String) { sent?(messageID) }
    func onSuccess() { deleted?() }
    func onFailure(messageID: String, error: SendFileError) { failed?(error) }
    func onFailure(messageID: String, error: SendFilesError) { failed?(error) }
    func onFailure(error: DeleteUploadedFileError) { failed?(error) }
}

private func attachmentErrorCode(_ error: Error) -> String {
    if let error = error as? AccessError {
        switch error {
        case .invalidSession: return "NULL_SESSION"
        case .invalidThread: return "WRONG_SESSION"
        }
    }
    if error is SendFileError || error is SendFilesError || error is DeleteUploadedFileError {
        return String(describing: error)
            .replacingOccurrences(of: "([a-z0-9])([A-Z])", with: "$1_$2", options: .regularExpression)
            .uppercased()
    }
    return "ATTACHMENT_OPERATION_FAILED"
}

private final class RnWebimStickerCompletionHandler: NSObject, SendStickerCompletionHandler {
    private let resolve: RCTPromiseResolveBlock
    private let reject: RCTPromiseRejectBlock

    init(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        self.resolve = resolve
        self.reject = reject
    }

    func onSuccess() {
        resolve(nil)
    }

    func onFailure(error: SendStickerError) {
        switch error {
        case .noChat:
            reject("NO_CHAT", "There is no active chat for sending a sticker", error)
        case .noStickerId:
            reject("NO_STICKER_ID", "The sticker ID is invalid", error)
        }
    }
}

private final class RnWebimKeyboardCompletionHandler: NSObject, SendKeyboardRequestCompletionHandler {
    private let resolve: RCTPromiseResolveBlock
    private let reject: RCTPromiseRejectBlock

    init(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        self.resolve = resolve
        self.reject = reject
    }

    func onSuccess(messageID: String) {
        resolve(messageID)
    }

    func onFailure(messageID: String, error: KeyboardResponseError) {
        reject("KEYBOARD_RESPONSE_FAILED", String(describing: error), error)
    }
}

private final class RnWebimMessageActionCompletionHandler: NSObject, EditMessageCompletionHandler, DeleteMessageCompletionHandler, ReactionCompletionHandler {
    private let resolve: RCTPromiseResolveBlock
    private let reject: RCTPromiseRejectBlock
    private let release: () -> Void

    init(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock, release: @escaping () -> Void) {
        self.resolve = resolve
        self.reject = reject
        self.release = release
    }

    func onSuccess(messageID: String) {
        release()
        resolve(nil)
    }

    func onFailure(messageID: String, error: EditMessageError) {
        release()
        reject("EDIT_MESSAGE_FAILED", String(describing: error), error)
    }

    func onFailure(messageID: String, error: DeleteMessageError) {
        release()
        reject("DELETE_MESSAGE_FAILED", String(describing: error), error)
    }

    func onFailure(error: ReactionError) {
        release()
        reject("REACTION_FAILED", String(describing: error), error)
    }
}

@objc(RnWebimChat)
open class RnWebimChat: RCTEventEmitter, MessageListener, OperatorTypingListener, UnreadByVisitorMessageCountChangeListener, FatalErrorHandler, NotFatalErrorHandler {
    
    var chatSession: WebimSession?
    var messageStream: MessageStream!
    var messageTracker: MessageTracker?
    private let messagesLock = NSLock()
    private var messagesByID: [String: Message] = [:]
    private var messageActionHandlers: [UUID: RnWebimMessageActionCompletionHandler] = [:]

    private var pickerController: UIImagePickerController;
    private weak var delegate: ImagePickerDelegate?;
    var resolveAttachCallback: RCTResponseSenderBlock?;
    var rejectAttachCallback: RCTResponseSenderBlock?;

    private let sendFileHandlersLock = NSLock()
    private var sendFileHandlers: [UUID: WebimFileSendCompletionHandler] = [:]
    private var uploadedFiles: [String: UploadedFile] = [:]
    private var busyUploadHandles: Set<String> = []
    private var attemptedCommitHandles: Set<String> = []
    private var attachmentHandlers: [UUID: RnWebimAttachmentCompletionHandler] = [:]
    private var attachmentRejecters: [UUID: RCTPromiseRejectBlock] = [:]
    private var attachmentGeneration = UUID()
    // Picker URIs remain retryable until session cleanup; there is no per-selection release API.
    private var pickerCopies: Set<URL> = []
    private var multiplePickerResolve: RCTPromiseResolveBlock?
    private var multiplePickerReject: RCTPromiseRejectBlock?
    private var multiplePickerLimit = 10
    private var multiplePickerOperation: UUID?
    private weak var multiplePickerController: UIViewController?
    private var pendingPushToken: String?
    private var pushSystem = "none"

    @objc(setPushToken:withResolver:withRejecter:)
    func setPushToken(token: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        guard validAPNSToken(token) else {
            reject("INVALID_PUSH_TOKEN", "APNs token must be nonempty hexadecimal; empty tokens do not unregister push", nil)
            return
        }
        guard chatSession == nil || pushSystem == "apns" else {
            reject("INVALID_PUSH_SYSTEM", "The active session must enable apns before updating its token", nil)
            return
        }
        do {
            try chatSession?.set(deviceToken: token)
            pendingPushToken = token
            resolve(nil)
        } catch {
            reject("PUSH_TOKEN_UPDATE_FAILED", error.localizedDescription, error)
        }
    }

    private func validAPNSToken(_ token: String) -> Bool {
        return !token.isEmpty && token.count % 2 == 0 && token.unicodeScalars.allSatisfy {
            (48...57).contains($0.value) || (65...70).contains($0.value) || (97...102).contains($0.value)
        }
    }

    @objc(uploadFile:withName:withMime:withExtension:withResolver:withRejecter:)
    func uploadFile(uri: String, name: String, mime: String, fileExtension: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard chatSession != nil, messageStream != nil else {
            reject("NULL_SESSION", "Upload requires an active session", nil)
            return
        }
        guard let url = URL(string: uri), url.isFileURL, !name.isEmpty, !mime.isEmpty else {
            reject("INVALID_ATTACHMENT", "A readable local file URI, name and MIME type are required", nil)
            return
        }
        let operation = UUID()
        let generation = attachmentGeneration
        attachmentRejecters[operation] = reject
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let dataResult = Result { try Data(contentsOf: url) }
            DispatchQueue.main.async {
                guard self.attachmentGeneration == generation, self.attachmentRejecters[operation] != nil else { return }
                do {
                    let data = try dataResult.get()
                    let handler = RnWebimAttachmentCompletionHandler()
                    handler.uploaded = { [weak self] file in
                        DispatchQueue.main.async {
                            guard let self, self.attachmentRejecters.removeValue(forKey: operation) != nil else { return }
                            self.attachmentHandlers.removeValue(forKey: operation)
                            let handle = UUID().uuidString
                            self.uploadedFiles[handle] = file
                            resolve(handle)
                        }
                    }
                    handler.failed = { [weak self] error in
                        DispatchQueue.main.async { self?.failAttachmentOperation(operation, error: error) }
                    }
                    self.attachmentHandlers[operation] = handler
                    _ = try self.messageStream.uploadFilesToServer(file: data, filename: name, mimeType: mime, completionHandler: handler)
                } catch {
                    self.failAttachmentOperation(operation, error: error)
                }
            }
        }
    }

    @objc(sendUploadedFiles:withResolver:withRejecter:)
    func sendUploadedFiles(handles: [String], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard chatSession != nil, messageStream != nil else {
            reject("NULL_SESSION", "Send requires an active session", nil)
            return
        }
        guard !handles.isEmpty, handles.count <= 10, Set(handles).count == handles.count,
              handles.allSatisfy({ uploadedFiles[$0] != nil && !busyUploadHandles.contains($0) }) else {
            reject("INVALID_UPLOAD_HANDLES", "A group requires 1 to 10 distinct, current, idle upload handles", nil)
            return
        }
        let operation = UUID()
        let handler = RnWebimAttachmentCompletionHandler()
        busyUploadHandles.formUnion(handles)
        attachmentRejecters[operation] = reject
        handler.sent = { [weak self] id in
            DispatchQueue.main.async {
                guard let self, self.attachmentRejecters.removeValue(forKey: operation) != nil else { return }
                self.attachmentHandlers.removeValue(forKey: operation)
                self.busyUploadHandles.subtract(handles)
                for handle in handles {
                    self.uploadedFiles.removeValue(forKey: handle)
                    self.attemptedCommitHandles.remove(handle)
                }
                resolve(["id": id])
            }
        }
        handler.failed = { [weak self] error in
            DispatchQueue.main.async {
                guard let self, self.attachmentRejecters[operation] != nil else { return }
                self.busyUploadHandles.subtract(handles)
                self.failAttachmentOperation(operation, error: error)
            }
        }
        attachmentHandlers[operation] = handler
        do {
            attemptedCommitHandles.formUnion(handles)
            _ = try messageStream.send(uploadedFiles: handles.compactMap { uploadedFiles[$0] }, completionHandler: handler)
        } catch {
            busyUploadHandles.subtract(handles)
            failAttachmentOperation(operation, error: error)
        }
    }

    @objc(deleteUploadedFile:withResolver:withRejecter:)
    // Explicit deletion is caller-authorized even after an uncertain commit; selected URIs stay valid.
    func deleteUploadedFile(handle: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard chatSession != nil, messageStream != nil, let file = uploadedFiles[handle], !busyUploadHandles.contains(handle) else {
            reject("INVALID_UPLOAD_HANDLE", "Unknown, stale, or busy upload handle", nil)
            return
        }
        let operation = UUID()
        let handler = RnWebimAttachmentCompletionHandler()
        busyUploadHandles.insert(handle)
        attachmentRejecters[operation] = reject
        handler.deleted = { [weak self] in
            DispatchQueue.main.async {
                guard let self, self.attachmentRejecters.removeValue(forKey: operation) != nil else { return }
                self.attachmentHandlers.removeValue(forKey: operation)
                self.busyUploadHandles.remove(handle)
                self.uploadedFiles.removeValue(forKey: handle)
                self.attemptedCommitHandles.remove(handle)
                resolve(nil)
            }
        }
        handler.failed = { [weak self] error in
            DispatchQueue.main.async {
                guard let self, self.attachmentRejecters[operation] != nil else { return }
                self.busyUploadHandles.remove(handle)
                self.failAttachmentOperation(operation, error: error)
            }
        }
        attachmentHandlers[operation] = handler
        do {
            try messageStream.deleteUploadedFiles(fileGuid: file.getGuid(), completionHandler: handler)
        } catch {
            busyUploadHandles.remove(handle)
            failAttachmentOperation(operation, error: error)
        }
    }

    private func failAttachmentOperation(_ operation: UUID, error: Error) {
        let reject = attachmentRejecters.removeValue(forKey: operation)
        attachmentHandlers.removeValue(forKey: operation)
        reject?(attachmentErrorCode(error), String(describing: error), error)
    }

    private func clearAttachmentState() {
        attachmentGeneration = UUID()
        if let stream = messageStream {
            // A failed send callback does not prove the server did not commit the group.
            for (handle, file) in uploadedFiles where !busyUploadHandles.contains(handle) && !attemptedCommitHandles.contains(handle) {
                try? stream.deleteUploadedFiles(fileGuid: file.getGuid(), completionHandler: nil)
            }
        }
        let rejecters = Array(attachmentRejecters.values)
        attachmentRejecters.removeAll()
        attachmentHandlers.removeAll()
        uploadedFiles.removeAll()
        busyUploadHandles.removeAll()
        attemptedCommitHandles.removeAll()
        for reject in rejecters { reject("SESSION_DESTROYED", "Attachment operation interrupted by session destruction", nil) }
        for url in pickerCopies { try? FileManager.default.removeItem(at: url) }
        pickerCopies.removeAll()
        multiplePickerController?.dismiss(animated: true)
        finishMultiplePicker(errorCode: "SESSION_DESTROYED", message: "Attachment selection interrupted by session destruction")
        if let reject = rejectAttachCallback {
            pickerController.dismiss(animated: true)
            reject([getErrorObject(errorCode: "SESSION_DESTROYED", message: "Attachment selection interrupted by session destruction", isFatal: false)])
        }
        resolveAttachCallback = nil
        rejectAttachCallback = nil
    }


    override init() {
        self.pickerController = UIImagePickerController();
        super.init();
        self.pickerController.delegate = self
        self.pickerController.allowsEditing = true
        self.pickerController.mediaTypes = ["public.image", "public.movie"]
    }


    @objc(initSession:withResolver:withRejecter:)
    func initSession(builderData: NSDictionary, resolve:RCTPromiseResolveBlock, reject:RCTPromiseRejectBlock) -> Void {
        if(chatSession == nil) {
            var sessionBuilder = Webim.newSessionBuilder();

            sessionBuilder = sessionBuilder
                .set(accountName:  builderData.value(forKey: "accountName") as! String)
                .set(location: builderData.value(forKey: "location") as! String)
                .set(onlineStatusRequestFrequencyInMillis: 1500)
                .set(remoteNotificationSystem: .none);

            // Optional
            let accountJSONAsString: String? = builderData.value(forKey: "accountJSON") as? String;
            let providedAuthorizationToken: String? = builderData.value(forKey: "providedAuthorizationToken") as? String;
            let appVersion: String? = builderData.value(forKey: "appVersion") as? String;
            let clearVisitorData: Bool? = builderData.value(forKey: "clearVisitorData") as? Bool;
            let storeHistoryLocally: Bool? = builderData.value(forKey: "storeHistoryLocally") as? Bool
            let title: String? = builderData.value(forKey: "title") as? String;
            let pushToken: String? = builderData.value(forKey: "pushToken") as? String ?? pendingPushToken
            let requestedPushSystem = builderData.value(forKey: "pushSystem") as? String ?? (pushToken == nil ? "none" : "apns")
            guard requestedPushSystem == "none" || requestedPushSystem == "apns" else {
                reject("INVALID_PUSH_SYSTEM", "iOS supports none or apns, not fcm", nil)
                return
            }
            guard pushToken == nil || (requestedPushSystem == "apns" && validAPNSToken(pushToken!)) else {
                reject("INVALID_PUSH_TOKEN", "A token requires apns and must be nonempty hexadecimal", nil)
                return
            }
            pushSystem = requestedPushSystem
            sessionBuilder = sessionBuilder.set(remoteNotificationSystem: requestedPushSystem == "apns" ? .apns : .none)
            let prechat: String? = builderData.value(forKey: "prechat") as? String;

            if(accountJSONAsString != nil) {
                sessionBuilder = sessionBuilder.set(visitorFieldsJSONData: accountJSONAsString!.data(using: .utf8)!)
            }

            if(providedAuthorizationToken != nil) {
                sessionBuilder = sessionBuilder.set(
                    providedAuthorizationTokenStateListener: nil,
                    providedAuthorizationToken: providedAuthorizationToken)
            }

            if(appVersion != nil) {
                sessionBuilder = sessionBuilder.set(appVersion: appVersion)
            }

            if(clearVisitorData != nil) {
                sessionBuilder = sessionBuilder.set(isVisitorDataClearingEnabled: clearVisitorData!)
            }

            if(storeHistoryLocally != nil) {
                sessionBuilder = sessionBuilder.set(isLocalHistoryStoragingEnabled: storeHistoryLocally!)
            }

            if(title != nil) {
                sessionBuilder = sessionBuilder.set(pageTitle: title)
            }

            if(pushToken != nil && requestedPushSystem == "apns") {
                sessionBuilder = sessionBuilder
                    .set(remoteNotificationSystem: .apns)
                    .set(deviceToken: pushToken)
            }

            if(prechat != nil) {
                sessionBuilder = sessionBuilder.set(prechat: prechat!)
            }
            do {
                chatSession = try sessionBuilder.build()
            } catch let error as SessionBuilder.SessionBuilderError {
                var errorCode = "UNKWNOWN"
                switch error {
                case .nilAccountName:
                    errorCode = "NULL_ACCOUNT_NAME"
                    break
                case .nilLocation:
                    errorCode = "NULL_LOCATION"
                    break
                case .invalidAuthentificatorParameters:
                    errorCode = "INVALID_AUTHENTIFICATOR_PARAMETERS"
                    break
                case .invalidRemoteNotificationConfiguration:
                    errorCode = "INVALID_REMOTE_NOTIFICATION_CONFIGURATION"
                    break
                case .invalidHex:
                    errorCode = "INVALID_HEX"
                    break
                case .unknown:
                    errorCode = "UNKNOWN"
                    break
                }
                handleError(rejecter: reject, errorCode: errorCode, message: error.localizedDescription, isFatal: true)
                return
            } catch {
                handleError(rejecter: reject, errorCode: "NULL_SESSION", message: error.localizedDescription, isFatal: true)
                return
            }
        }

        if messageTracker != nil {
            resolve(nil)
            return
        }

        do {
            if(chatSession == nil) {
                throw AccessError.invalidSession
            }
            messageStream = chatSession!.getStream();
            try messageStream.setChatRead();
            try messageTracker = messageStream.newMessageTracker(messageListener: self)
            try messageStream.startChat();
            messageStream.set(operatorTypingListener: self)
            messageStream.set(unreadByVisitorMessageCountChangeListener: self)
        } catch AccessError.invalidSession {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Session is destoyed", isFatal: true)
            return
        } catch AccessError.invalidThread {
            handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Session is not initialized in current thread", isFatal: true)
            return
        } catch let error {
            handleError(rejecter: reject, errorCode: "UNKNOWN", message: error.localizedDescription, isFatal: true)
            return
        }

        resolve(nil)
  }

    @objc(resumeSession:withRejecter:)
    func resumeSession(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        do {
            try chatSession?.resume()
            resolve(nil)
        } catch AccessError.invalidSession {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Session is destoyed", isFatal: true)
        } catch AccessError.invalidThread {
            handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Session is not initialized in current thread", isFatal: true)
        } catch let error {
            handleError(rejecter: reject, errorCode: "UNKNOWN", message: error.localizedDescription, isFatal: true)
        }
    }

    @objc(pauseSession:withRejecter:)
    func pauseSession(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        do {
            try chatSession?.pause()
            resolve(nil)
        } catch AccessError.invalidSession {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Session is destoyed", isFatal: true)
        } catch AccessError.invalidThread {
            handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Session is not initialized in current thread", isFatal: true)
        } catch let error {
            handleError(rejecter: reject, errorCode: "UNKNOWN", message: error.localizedDescription, isFatal: true)
        }
    }

    @objc(destroySession:withResolver:withRejecter:)
    func destroySession(clearuserData: Bool, resolve:RCTPromiseResolveBlock, reject:RCTPromiseRejectBlock) -> Void {
        clearAttachmentState()
        if(messageTracker != nil) {
            do {
                try messageTracker?.destroy()
                messageTracker = nil
            } catch AccessError.invalidSession {
                handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Can not destroy. Session is destoyed", isFatal: true)
                return
            } catch AccessError.invalidThread {
                handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Can not destroy. Session is not initialized in current thread", isFatal: true)
                return
            } catch let error {
                handleError(rejecter: reject, errorCode: "UNKNOWN", message: "Destroy session failed", isFatal: true)
                return
            }
        }

        if(chatSession != nil) {
            do {
                if(clearuserData) {
                    try chatSession?.destroyWithClearVisitorData()
                } else {
                    try chatSession?.destroy()
                }
            } catch AccessError.invalidSession {
                handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Can not destroy. Session is destoyed", isFatal: true)
                return
            } catch AccessError.invalidThread {
                handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Can not destroy. Session is not initialized in current thread", isFatal: true)
                return
            } catch let error {
                handleError(rejecter: reject, errorCode: "UNKNOWN", message: error.localizedDescription, isFatal: true)
                return
            }

            chatSession = nil
        }

        messageStream = nil
        pendingPushToken = nil
        pushSystem = "none"
        messagesLock.lock()
        messagesByID.removeAll()
        messagesLock.unlock()

        resolve(nil)
    }

    @objc(getAllMessages:withRejecter:)
    func getAllMessages(resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        do {
            try messageTracker?.getAllMessages(completion: { result in
                var messages: [[String: Any]] = []
                for message in result {
                    messages.append(self.messageToJson(message: message) as [String : Any])
                }

                resolve(messages)
            })
            try messageStream?.setChatRead()
        } catch AccessError.invalidSession {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Session is destoyed", isFatal: true)
        } catch AccessError.invalidThread {
            handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Session is not initialized in current thread", isFatal: true)
        } catch let error {
            handleError(rejecter: reject, errorCode: "UNKNOWN", message: "Can not fetch all messages. Details: " + error.localizedDescription, isFatal: true)
        }
    }

    @objc(getLastMessages:withResolver:withRejecter:)
    func getLastMessages(limit: NSNumber, resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        do {
            try messageTracker?.getLastMessages(byLimit: limit.intValue, completion: { result in
                var messages: [[String: Any]] = []
                for message in result {
                    messages.append(self.messageToJson(message: message) as [String : Any])
                }

                resolve(messages)
            })
        } catch AccessError.invalidSession {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Session is destoyed", isFatal: true)
        } catch AccessError.invalidThread {
            handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Session is not initialized in current thread", isFatal: true)
        } catch let error {
            handleError(rejecter: reject, errorCode: "UNKNOWN", message: "Can not fetch last messages. Details: " + error.localizedDescription, isFatal: true)
        }
    }

    @objc(getNextMessages:withResolver:withRejecter:)
    func getNextMessages(limit: NSNumber, resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        do {
            try messageTracker?.getNextMessages(byLimit: limit.intValue, completion: { result in
                var messages: [[String: Any]] = []
                for message in result {
                    messages.append(self.messageToJson(message: message) as [String : Any])
                }

                resolve(messages)
            })
        } catch AccessError.invalidSession {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Session is destoyed", isFatal: true)
        } catch AccessError.invalidThread {
            handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Session is not initialized in current thread", isFatal: true)
        } catch let error {
            handleError(rejecter: reject, errorCode: "UNKNOWN", message: "Can not fetch next messages. Details: " + error.localizedDescription, isFatal: true)
        }
    }

    @objc(send:withResolver:withRejecter:)
    func send(message: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        do {
            let _id = try messageStream?.send(message: message)
            try messageStream?.setChatRead()
            resolve(_id);
        } catch AccessError.invalidSession {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Session is destoyed", isFatal: true)
        } catch AccessError.invalidThread {
            handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Session is not initialized in current thread", isFatal: true)
        } catch let error {
            handleError(rejecter: reject, errorCode: "UNKNOWN", message: "Can not send a message. Details: " + error.localizedDescription, isFatal: true)
        }
    }

    @objc(reply:withReplyToId:withResolver:withRejecter:)
    func reply(message: String, replyToId: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        messagesLock.lock()
        let repliedMessage = messagesByID[replyToId]
        messagesLock.unlock()

        guard let repliedMessage else {
            handleError(rejecter: reject, errorCode: "MESSAGE_NOT_FOUND", message: "Reply target is not in the loaded message history", isFatal: false)
            return
        }

        do {
            let messageID = try messageStream.reply(message: message, repliedMessage: repliedMessage)
            resolve(messageID != nil)
        } catch AccessError.invalidSession {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Session is destroyed", isFatal: true)
        } catch AccessError.invalidThread {
            handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Session is not initialized in current thread", isFatal: true)
        } catch let error {
            handleError(rejecter: reject, errorCode: "UNKNOWN", message: "Can not reply to a message. Details: " + error.localizedDescription, isFatal: false)
        }
    }

    @objc(sendSticker:withResolver:withRejecter:)
    func sendSticker(stickerID: NSNumber, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let messageStream = messageStream else {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Can not send a sticker without an active session", isFatal: true)
            return
        }

        let completionHandler = RnWebimStickerCompletionHandler(resolve: resolve, reject: reject)
        do {
            try messageStream.sendSticker(withId: stickerID.intValue, completionHandler: completionHandler)
        } catch AccessError.invalidSession {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Session is destroyed", isFatal: true)
        } catch AccessError.invalidThread {
            handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Session is not initialized in current thread", isFatal: true)
        } catch let error {
            handleError(rejecter: reject, errorCode: "UNKNOWN", message: "Can not send a sticker. Details: " + error.localizedDescription, isFatal: false)
        }
    }

    @objc(sendKeyboardResponse:withButtonId:withResolver:withRejecter:)
    func sendKeyboardResponse(messageID: String, buttonID: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        messagesLock.lock()
        let message = messagesByID[messageID]
        messagesLock.unlock()

        guard let message else {
            handleError(rejecter: reject, errorCode: "MESSAGE_NOT_FOUND", message: "Keyboard message is not in the loaded message history", isFatal: false)
            return
        }
        guard let currentChatID = message.getCurrentChatID() else {
            handleError(rejecter: reject, errorCode: "KEYBOARD_MESSAGE_ID_MISSING", message: "Keyboard message has no current chat ID", isFatal: false)
            return
        }
        guard let messageStream = messageStream else {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Can not send a keyboard response without an active session", isFatal: true)
            return
        }

        do {
            try messageStream.sendKeyboardRequest(
                buttonID: buttonID,
                messageCurrentChatID: currentChatID,
                completionHandler: RnWebimKeyboardCompletionHandler(resolve: resolve, reject: reject)
            )
        } catch AccessError.invalidSession {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Session is destroyed", isFatal: true)
        } catch AccessError.invalidThread {
            handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Session is not initialized in current thread", isFatal: true)
        } catch let error {
            handleError(rejecter: reject, errorCode: "KEYBOARD_RESPONSE_FAILED", message: error.localizedDescription, isFatal: false)
        }
    }

    @objc(setVisitorTyping:withResolver:withRejecter:)
    func setVisitorTyping(draft: String?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let messageStream else {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Session is destroyed", isFatal: false)
            return
        }
        do {
            try messageStream.setVisitorTyping(draftMessage: draft)
            resolve(nil)
        } catch AccessError.invalidSession {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Session is destroyed", isFatal: false)
        } catch AccessError.invalidThread {
            handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Typing update failed", isFatal: false)
        } catch {
            handleError(rejecter: reject, errorCode: "TYPING_FAILED", message: "Typing update failed", isFatal: false)
        }
    }

    @objc(editMessage:withText:withResolver:withRejecter:)
    func editMessage(messageID: String, text: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        performMessageAction(messageID: messageID, resolve: resolve, reject: reject) { stream, message, handler in
            try stream.edit(message: message, text: text, completionHandler: handler)
        }
    }

    @objc(deleteMessage:withResolver:withRejecter:)
    func deleteMessage(messageID: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        performMessageAction(messageID: messageID, resolve: resolve, reject: reject) { stream, message, handler in
            try stream.delete(message: message, completionHandler: handler)
        }
    }

    @objc(sendReaction:withReaction:withResolver:withRejecter:)
    func sendReaction(messageID: String, reaction: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let sdkReaction: ReactionString
        switch reaction {
        case "like": sdkReaction = .like
        case "dislike": sdkReaction = .dislike
        default:
            handleError(rejecter: reject, errorCode: "INVALID_REACTION", message: "Reaction must be like or dislike", isFatal: false)
            return
        }
        performMessageAction(messageID: messageID, resolve: resolve, reject: reject) { stream, message, handler in
            try stream.react(message: message, reaction: sdkReaction, completionHandler: handler)
        }
    }

    private func performMessageAction(messageID: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock, operation: (MessageStream, Message, RnWebimMessageActionCompletionHandler) throws -> Bool) {
        messagesLock.lock()
        let message = messagesByID[messageID]
        messagesLock.unlock()
        guard let message else {
            handleError(rejecter: reject, errorCode: "MESSAGE_NOT_FOUND", message: "Message is not in the loaded message history", isFatal: false)
            return
        }
        guard let messageStream else {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Can not modify a message without an active session", isFatal: true)
            return
        }

        let operationID = UUID()
        let release = { [weak self] in
            guard let self else { return }
            self.messagesLock.lock()
            self.messageActionHandlers.removeValue(forKey: operationID)
            self.messagesLock.unlock()
        }
        let handler = RnWebimMessageActionCompletionHandler(resolve: resolve, reject: reject, release: release)
        messagesLock.lock()
        messageActionHandlers[operationID] = handler
        messagesLock.unlock()
        do {
            if try !operation(messageStream, message, handler) {
                release()
                handleError(rejecter: reject, errorCode: "MESSAGE_ACTION_REJECTED", message: "Message action was not accepted", isFatal: false)
            }
        } catch AccessError.invalidSession {
            release()
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Session is destroyed", isFatal: true)
        } catch AccessError.invalidThread {
            release()
            handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Session is not initialized in current thread", isFatal: true)
        } catch let error {
            release()
            handleError(rejecter: reject, errorCode: "UNKNOWN", message: error.localizedDescription, isFatal: false)
        }
    }

    @objc(readMessages:withRejecter:)
    func readMessages(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        do {
            try messageStream.setChatRead()
            resolve(nil)
        } catch AccessError.invalidSession {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Session is destoyed", isFatal: true)
        } catch AccessError.invalidThread {
            handleError(rejecter: reject, errorCode: "WRONG_SESSION", message: "Session is not initialized in current thread", isFatal: true)
        } catch let error {
            handleError(rejecter: reject, errorCode: "UNKNOWN", message: "Can not mark messages as read. Details: " + error.localizedDescription, isFatal: true)
        }
    }

    @objc(rateOperator:withResolver:withRejecter:)
    func rateOperator(rate: NSNumber, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
        do {
            if(messageStream == nil) {
                handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Can not rate an operator. As session is null.", isFatal: true)
                return
            }
            
            let currentOperator = messageStream.getCurrentOperator();
            if (currentOperator != nil) {

                try messageStream.rateOperatorWith(id: currentOperator?.getID(), byRating: rate.intValue, completionHandler: RateCompletionWrapper(resolve: resolve, reject: reject))
            }
        } catch {
            handleError(rejecter: reject, errorCode: "UNKNOWN", message: "Can not rate an operator. Details: " + error.localizedDescription, isFatal: true)
        }
    }
    
    @objc(getCurrentOperator:withRejecter:)
    func getCurrentOperator(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        if(messageStream == nil) {
            handleError(rejecter: reject, errorCode: "NULL_SESSION", message: "Can not get an operator. As session is null.", isFatal: true)
            return
        }

        let currentOperator = messageStream.getCurrentOperator();
        if (currentOperator != nil) {
            let result = [
                "id": currentOperator?.getID(),
                "name": currentOperator?.getName(),
                "title": currentOperator?.getTitle(),
                "info": currentOperator?.getInfo(),
                "avatar": currentOperator?.getAvatarURL()?.absoluteString
            ] as [String : Any?]
            
            resolve(result)
        } else {
            resolve(nil)
        }
    }

    @objc(tryAttachFile:withResolver:)
    func tryAttachFile(reject: @escaping RCTResponseSenderBlock, resolve: @escaping RCTResponseSenderBlock) -> Void {
            DispatchQueue.main.async {
              guard self.multiplePickerResolve == nil, self.resolveAttachCallback == nil else {
                  reject([self.getErrorObject(errorCode: "ATTACHMENT_PICKER_BUSY", message: "A file picker is already open", isFatal: false)])
                  return
              }
              self.resolveAttachCallback = resolve
              self.rejectAttachCallback = reject
              guard let view = RCTPresentedViewController(), view.viewIfLoaded?.window != nil else {
                  self.resolveAttachCallback = nil
                  self.rejectAttachCallback = nil
                  reject([self.getErrorObject(errorCode: "ACTIVITY_UNAVAILABLE", message: "No view controller is available to present the picker", isFatal: false)])
                  return
              }
              view.present(self.pickerController, animated: true)
            }
    }

    @objc(sendFile:withName:withMime:withExtention:withRejecter:withResolver:)
    func sendFile(uri: String, name: String, mime: String, extention: String, reject: @escaping RCTResponseSenderBlock, resolve: @escaping RCTResponseSenderBlock) {
        let operationID = UUID()
        let completionHandler = WebimFileSendCompletionHandler(
            onSuccess: { [weak self] messageID in
                self?.releaseSendFileHandler(operationID)
                resolve([["id": messageID]])
            },
            onFailure: { [weak self] _, error in
                guard let self else { return }
                self.releaseSendFileHandler(operationID)
                reject([getErrorObject(errorCode: self.sendErrorToString(error: error),
                                       message: error.localizedDescription, isFatal: true)])
            }
        )
        self.retainSendFileHandler(completionHandler, for: operationID)

        do {
            let imageData = try Data(contentsOf: URL(string: uri)!)
            _ = try messageStream.send(file: imageData, filename: name, mimeType: mime, completionHandler: completionHandler)
        } catch AccessError.invalidSession {
            self.releaseSendFileHandler(operationID)
            reject([getErrorObject(errorCode: "NULL_SESSION", message: "Session is destoyed", isFatal: true)])
        } catch AccessError.invalidThread {
            self.releaseSendFileHandler(operationID)
            reject([getErrorObject(errorCode: "WRONG_SESSION", message: "Session is not initialized in current thread", isFatal: true)])
        } catch let error {
            self.releaseSendFileHandler(operationID)
            reject([getErrorObject(errorCode: "UNKNOWN", message: "Can not send a message. Details: " + error.localizedDescription, isFatal: true)])
        }
    }

    private func retainSendFileHandler(_ handler: WebimFileSendCompletionHandler, for operationID: UUID) {
        self.sendFileHandlersLock.lock()
        defer { self.sendFileHandlersLock.unlock() }
        self.sendFileHandlers[operationID] = handler
    }

    private func releaseSendFileHandler(_ operationID: UUID) {
        self.sendFileHandlersLock.lock()
        defer { self.sendFileHandlersLock.unlock() }
        self.sendFileHandlers.removeValue(forKey: operationID)
    }

    @objc
    override public static func requiresMainQueueSetup() -> Bool {
        return true
    }

    @objc
    private func pickerController(_ controller: UIImagePickerController) {
        controller.dismiss(animated: true, completion: nil)
    }

    // EventEmitter Events
    @objc(supportedEvents)
    override open func supportedEvents() -> [String] {
        return ["newMessage", "removeMessage", "changedMessage", "allMessagesRemoved", "tokenUpdated", "error", "onlineState", "typing", "unreadCount", "fileUploading"]
    }

    public func added(message newMessage: Message, after previousMessage: Message?) {
        self.sendEvent(withName: "newMessage", body: self.messageToJson(message: newMessage))
    }

    public func removed(message: Message) {
        let payload = self.messageToJson(message: message)
        messagesLock.lock()
        messagesByID.removeValue(forKey: message.getID())
        messagesLock.unlock()
        self.sendEvent(withName: "removeMessage", body: payload)
    }

    public func removedAllMessages() {
        messagesLock.lock()
        messagesByID.removeAll()
        messagesLock.unlock()
        self.sendEvent(withName: "allMessagesRemoved", body: [])
    }

    public func changed(message oldVersion: Message, to newVersion: Message) {
        let oldPayload = self.messageToJson(message: oldVersion)
        let newPayload = self.messageToJson(message: newVersion)
        self.sendEvent(withName: "changedMessage", body: ["from": oldPayload, "to": newPayload])
    }

    public func onOperatorTypingStateChanged(isTyping: Bool) {
        self.sendEvent(withName: "typing", body: ["isTyping": isTyping])
    }

    public func changedUnreadByVisitorMessageCountTo(newValue: Int) {
        self.sendEvent(withName: "unreadCount", body: newValue)
    }
    
    // Error Handling
    public func on(error: WebimError) {
        self.sendEvent(withName: "error", body: getErrorObject(errorCode: self.fatalErrorToString(error: error.getErrorType()),
                                                               message: error.getErrorString(), isFatal: true))
    }
    
    public func on(error: WebimNotFatalError) {
        var errorCode = "UNKWNOWN";
        switch error.getErrorType() {
        case .noNetworkConnection:
            errorCode = "NO_NETWORK_CONNECTION"
            break
        case .serverIsNotAvailable:
            errorCode = "SOCKET_TIMEOUT_EXPIRED"
            break
        }
        self.sendEvent(withName: "error", body: getErrorObject(errorCode: errorCode, message: error.getErrorString(), isFatal: false))
    }
    
    public func connectionStateChanged(connected: Bool) {
        self.sendEvent(withName: "error", body: getErrorObject(errorCode: connected ? "SERVER_CONNECTED" : "SERVER_DISCONNECTED", message: "Server connection state changed", isFatal: false))
    }

    // Mapping section
    func messageToJson(message: Message) -> [String: Any?] {
        messagesLock.lock()
        messagesByID[message.getID()] = message
        messagesLock.unlock()

        let keyboard = message.getKeyboard()
        let keyboardRequest = message.getKeyboardRequest()
        let result = [
            "id": message.getID(),
            "serverSideId": message.getServerSideID(),
            "time": message.getTime().timeIntervalSince1970 * 1000,
            "type": self.typeToString(messageType: message.getType()),
            "text": message.getText(),
            "name": message.getSenderName(),
            "status": self.statusToString(messageStatus: message.getSendStatus()),
            "avatar": message.getSenderAvatarFullURL()?.absoluteString,
            "read": message.isReadByOperator(),
            "canEdit": message.canBeEdited(),
            "canReply": message.canBeReplied(),
            "isEdited": message.isEdited(),

            "canReact": message.canVisitorReact(),
            "canChangeReaction": message.canVisitorChangeReaction(),
            "visitorReaction": message.getVisitorReaction(),
            "stickerId": message.getSticker()?.getStickerId(),
            "keyboard": keyboard != nil ? self.keyboardToDictionary(keyboard: keyboard!) : nil,
            "keyboardRequest": keyboardRequest != nil ? self.keyboardRequestToDictionary(request: keyboardRequest!) : nil,

            "operatorId": message.getOperatorID(),
            "quote": message.getQuote() != nil ? self.quetoToDictionary(quote: message.getQuote()!) : nil,
            "attachment": message.getData()?.getAttachment()?.getFilesInfo().first.map { self.fileInfoToJson(file: $0) },
            "attachments": message.getData()?.getAttachment()?.getFilesInfo().map { self.fileInfoToJson(file: $0) },
        ] as [String : Any?]

        return result
    }

    func keyboardToDictionary(keyboard: Keyboard) -> [String: Any?] {
        let buttons = keyboard.getButtons().map { row in
            row.map { ["id": $0.getID(), "text": $0.getText()] as [String: Any?] }
        }
        let state: String
        switch keyboard.getState() {
        case .pending:
            state = "PENDING"
        case .completed:
            state = "COMPLETED"
        case .canceled:
            state = "CANCELED"
        }
        return [
            "buttons": buttons,
            "state": state,
            "response": keyboard.getResponse()?.getButtonID(),
        ]
    }

    func keyboardRequestToDictionary(request: KeyboardRequest) -> [String: Any?] {
        let button = request.getButton()
        return [
            "button": ["id": button.getID(), "text": button.getText()],
            "messageId": request.getMessageID(),
        ]
    }

    func typeToString(messageType: MessageType) -> String {
        switch (messageType) {
            case .actionRequest:
                return "ACTION_REQUEST";
            case .contactInformationRequest:
                return "CONTACTS_REQUEST";
            case .fileFromOperator:
                return "FILE_FROM_OPERATOR";
            case .fileFromVisitor:
                return "FILE_FROM_VISITOR";
            case .info:
                return "INFO";
            case .operatorMessage:
                return "OPERATOR";
            case .operatorBusy:
                return "OPERATOR_BUSY";
            case .visitorMessage:
                return "VISITOR";
            case .keyboard:
                return "KEYBOARD";
            case .keyboardResponse:
                return "KEYBOARD_RESPONSE"
            default:
                return "";
        }
    }

    func statusToString(messageStatus: MessageSendStatus) -> String {
        switch (messageStatus) {
        case .sending:
            return "SENDING";
        case .sent:
            return "SENT";
        }
    }

    func quoteStateToString(state: QuoteState) -> String {
        switch (state) {
        case .filled:
            return "FILLED";
        case .notFound:
            return "NOT_FOUND";
        case .pending:
            return "PENDING";
        }
    }

    func quetoToDictionary(quote: Quote) -> [String: Any?] {
        let result = [
            "authorId": quote.getAuthorID(),
            "senderName": quote.getSenderName(),
            "messageId": quote.getMessageID(),
            "messageText": quote.getMessageText(),
            "messageType": self.typeToString(messageType: quote.getMessageType()!),
            "state": self.quoteStateToString(state: quote.getState()),
            "timestamp": quote.getMessageTimestamp()!.timeIntervalSince1970 * 1000,
            "attachment":  quote.getMessageAttachment() != nil ? self.attachmentToJson(attachment: quote.getMessageAttachment() as? MessageAttachment) : nil,
        ] as [String : Any?]

        return result;
    }


    func attachmentToJson(attachment: MessageAttachment?) -> [String: Any?]  {
        guard let file = attachment?.getFileInfo() else { return [:] }
        return fileInfoToJson(file: file)
    }

    private func fileInfoToJson(file: FileInfo) -> [String: Any?] {
        return [
            "contentType": file.getContentType(),
            "info": file.getImageInfo()?.getThumbURL()?.absoluteString,
            "name": file.getFileName(),
            "size": file.getSize(),
            "url": file.getURL()?.absoluteString
        ];
    }
    
    func fatalErrorToString(error: FatalErrorType) -> String {
        switch error {
        case .accountBlocked:
            return "ACCOUNT_BLOCKED"
        case .initializationFailed:
            return "INITIALIZATION_FAILED"
        case .providedVisitorFieldsExpired:
            return "PROVIDED_VISITOR_EXPIRED"
        case .unknown:
            return "UNKNOWN"
        case .visitorBanned:
            return "VISITOR_BANNED"
        case .wrongProvidedVisitorHash:
            return "WRONG_PROVIDED_VISITOR_HASH"
        }
    }
    
    func sendErrorToString(error: SendFileError) -> String {
        switch error {
        case .fileSizeExceeded:
            return "FILE_SIZE_EXCEEDED"
        case .uploadCanceled:
            return "UPLOAD_CANCELED"
        case .maliciousFileDetected:
            return "MALICIOUS_FILE_DETECTED"
        case .uploadNotAllowed:
            return "UPLOAD_NOT_ALLOWED"
        case .unknown:
            return "UNKNOWN"
        case .fileSizeTooSmall:
            return "FILE_SIZE_TOO_SMALL"
        case .fileTypeNotAllowed:
            return "FILE_TYPE_NOT_ALLOWED"
        case .maxFilesCountPerChatExceeded:
            return "MAX_FILES_COUNT_PER_CHAT_EXCEEDED"
        case .uploadedFileNotFound:
            return "UPLOADED_FILE_NOT_FOUND"
        case .unauthorized:
            return "UNAUTHORIZED"
        }
    }
    
    func getErrorObject(errorCode: String, message: String, isFatal: Bool) -> [String: Any?] {
        let result = [
            "message": message,
            "errorCode": errorCode,
            "errorType": isFatal ? "fatal" : "common",
        ] as [String : Any?]

        return result;
    }
    
    func handleError(rejecter: RCTPromiseRejectBlock, errorCode: String, message: String, isFatal: Bool) {
        let errorBody = getErrorObject(errorCode: errorCode, message: message, isFatal: isFatal)
        rejecter(errorCode, message, NSError.init(domain: "com.rn-webim-chat.provider", code: -1, userInfo: errorBody))
    }
}

class RateCompletionWrapper : RateOperatorCompletionHandler {

    let resolver: RCTPromiseResolveBlock
    let rejecter: RCTPromiseRejectBlock

    init(resolve: @escaping RCTPromiseResolveBlock,  reject: @escaping RCTPromiseRejectBlock) {
        self.resolver = resolve
        self.rejecter = reject
    }

    func onSuccess() {
        resolver(nil)
    }

    func onFailure(error: RateOperatorError) {
        var code = "UNKWNOWN"
        switch error {
        case .noChat:
            code = "NO_CHAT"
            break
        case .rateDisabled:
            code = "RATE_DISABLED"
            break
        case .operatorNotInChat:
            code = "OPERATOR_NOT_IN_CHAT"
            break
        case .rateValueIncorrect:
            code = "RATE_VALUE_INCORRECT"
            break
        case .unknown:
            code = "UNKNOWN"
            break
        case .noteIsTooLong:
            code = "NOTE_IS_TOO_LONG"
            break
        case .wrongOperatorId:
            code = "OPERATOR_NOT_INT_CHAT"
            break
        }
        
        rejecter(code, error.localizedDescription, NSError.init(domain: "com.rn-webim-chat.provider", code: -1, userInfo: [
            "message": error.localizedDescription,
            "errorCode": code,
            "errorType": "common",
        ]))
    }
}

public protocol ImagePickerDelegate: AnyObject {
    func didSelect(image: UIImage?)
}

private final class WebimFileSendCompletionHandler: SendFileCompletionHandler {
    private let onSuccessCallback: (String) -> Void
    private let onFailureCallback: (String, SendFileError) -> Void

    init(onSuccess: @escaping (String) -> Void,
         onFailure: @escaping (String, SendFileError) -> Void) {
        self.onSuccessCallback = onSuccess
        self.onFailureCallback = onFailure
    }

    func onSuccess(messageID: String) {
        self.onSuccessCallback(messageID)
    }

    func onFailure(messageID: String, error: SendFileError) {
        self.onFailureCallback(messageID, error)
    }
}

extension RnWebimChat: UIImagePickerControllerDelegate {
    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        self.pickerController(picker)
        if let callback = self.rejectAttachCallback {
            callback([getErrorObject(errorCode: "ATTACHMENT_CANCELLED", message: "Attachment selection was cancelled", isFatal: false)])
    }
        self.resolveAttachCallback = nil
        self.rejectAttachCallback = nil
    }

  public func imagePickerController(_ picker: UIImagePickerController,
                                    didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
        if let mediaURL = info[UIImagePickerController.InfoKey.mediaURL] as? URL {
            let extensionName = mediaURL.pathExtension.lowercased()
            let mimeType = UTType(filenameExtension: extensionName)?.preferredMIMEType ?? "application/octet-stream"
            self.completeAttachment(picker: picker, url: mediaURL, mimeType: mimeType)
            return
        }

    if let imgUrl = info[UIImagePickerController.InfoKey.imageURL] as? URL {
        let imgName = imgUrl.lastPathComponent
        let documentDirectory = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true).first
            let localPath = documentDirectory?.appending("/" + imgName)
        let image = info[UIImagePickerController.InfoKey.originalImage] as! UIImage
        let data = image.pngData()! as NSData
        data.write(toFile: localPath!, atomically: true)
        let photoURL = URL.init(fileURLWithPath: localPath!)

        let extensionName = photoURL.pathExtension.lowercased()
            self.completeAttachment(picker: picker, url: photoURL, mimeType: "image/" + extensionName)
    }
  }

    private func completeAttachment(picker: UIImagePickerController, url: URL, mimeType: String) {
        self.pickerController(picker)
        guard let callback = self.resolveAttachCallback else { return }
        let result: [String: String] = [
            "uri": url.absoluteString,
            "name": url.lastPathComponent,
            "mime": mimeType,
            "extension": url.pathExtension.lowercased()
        ]
        callback([result])
        self.resolveAttachCallback = nil
        self.rejectAttachCallback = nil
    }
}

extension RnWebimChat: PHPickerViewControllerDelegate, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
    @objc(tryAttachFiles:withResolver:withRejecter:)
    func tryAttachFiles(options: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard multiplePickerResolve == nil, resolveAttachCallback == nil else {
            reject("ATTACHMENT_PICKER_BUSY", "A file picker is already open", nil)
            return
        }
        guard let kind = options["kind"] as? String, kind == "media" || kind == "documents",
              let maximum = options["maxFiles"] as? NSNumber,
              maximum.doubleValue >= 1, maximum.doubleValue <= 10,
              maximum.doubleValue == Double(maximum.intValue) else {
            reject("INVALID_ATTACHMENT_OPTIONS", "kind must be media or documents; maxFiles must be an integer from 1 to 10", nil)
            return
        }
        guard let presenter = RCTPresentedViewController(), presenter.viewIfLoaded?.window != nil else {
            reject("ACTIVITY_UNAVAILABLE", "No view controller is available to present the picker", nil)
            return
        }
        multiplePickerResolve = resolve
        multiplePickerReject = reject
        multiplePickerLimit = maximum.intValue
        multiplePickerOperation = UUID()
        let controller: UIViewController
        if kind == "media" {
            var configuration = PHPickerConfiguration()
            configuration.selectionLimit = maximum.intValue
            configuration.filter = .any(of: [.images, .videos])
            configuration.preferredAssetRepresentationMode = .current
            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            controller = picker
        } else {
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: false)
            picker.allowsMultipleSelection = true
            picker.delegate = self
            controller = picker
        }
        multiplePickerController = controller
        controller.presentationController?.delegate = self
        presenter.present(controller, animated: true)
        controller.presentationController?.delegate = self
    }

    private func finishMultiplePicker(results: [[String: String]]? = nil, errorCode: String? = nil, message: String? = nil) {
        let resolve = multiplePickerResolve
        let reject = multiplePickerReject
        multiplePickerResolve = nil
        multiplePickerReject = nil
        multiplePickerOperation = nil
        multiplePickerController = nil
        if let errorCode { reject?(errorCode, message, nil) }
        else if let results { resolve?(results) }
    }

    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        finishMultiplePicker(errorCode: "SELECT_FILE_CANCELED", message: "File selection canceled")
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finishMultiplePicker(errorCode: "SELECT_FILE_CANCELED", message: "File selection canceled")
    }

    private func copyPickerFile(_ url: URL, suggestedName: String? = nil) throws -> [String: String] {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let extensionName = url.pathExtension.lowercased()
        var name = suggestedName.flatMap { $0.isEmpty ? nil : $0 } ?? url.lastPathComponent
        if (name as NSString).pathExtension.isEmpty && !extensionName.isEmpty { name += "." + extensionName }
        let copy = FileManager.default.temporaryDirectory.appendingPathComponent("webim-picker-" + UUID().uuidString).appendingPathExtension(extensionName)
        var coordinationError: NSError?
        var copyError: Error?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { readableURL in
            do { try FileManager.default.copyItem(at: readableURL, to: copy) }
            catch { copyError = error }
        }
        if let error = coordinationError ?? (copyError as NSError?) {
            try? FileManager.default.removeItem(at: copy)
            throw error
        }
        return [
            "uri": copy.absoluteString,
            "name": name,
            "mime": UTType(filenameExtension: extensionName)?.preferredMIMEType ?? "application/octet-stream",
            "extension": extensionName
        ]
    }

    private func completePickerCopies(_ results: [[String: String]], operation: UUID, error: Error? = nil) {
        DispatchQueue.main.async {
            let urls = results.compactMap { $0["uri"].flatMap(URL.init(string:)) }
            guard self.multiplePickerOperation == operation, error == nil else {
                for url in urls { try? FileManager.default.removeItem(at: url) }
                if self.multiplePickerOperation == operation {
                    self.finishMultiplePicker(errorCode: "SELECT_FILE_FAILED", message: error?.localizedDescription)
                }
                return
            }
            self.pickerCopies.formUnion(urls)
            self.finishMultiplePicker(results: results)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let operation = multiplePickerOperation else { return }
        guard !urls.isEmpty, urls.count <= multiplePickerLimit else {
            finishMultiplePicker(errorCode: "ATTACHMENT_LIMIT_EXCEEDED", message: "Selected file count exceeds maxFiles or is empty")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            var results: [[String: String]] = []
            do {
                for url in urls { results.append(try self.copyPickerFile(url)) }
                self.completePickerCopies(results, operation: operation)
            } catch { self.completePickerCopies(results, operation: operation, error: error) }
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let operation = multiplePickerOperation else { return }
        guard !results.isEmpty else {
            finishMultiplePicker(errorCode: "SELECT_FILE_CANCELED", message: "File selection canceled")
            return
        }
        guard results.count <= multiplePickerLimit else {
            finishMultiplePicker(errorCode: "ATTACHMENT_LIMIT_EXCEEDED", message: "Selected file count exceeds maxFiles")
            return
        }
        loadMediaCopies(results, index: 0, copied: [], operation: operation)
    }

    private func loadMediaCopies(_ results: [PHPickerResult], index: Int, copied: [[String: String]], operation: UUID) {
        guard multiplePickerOperation == operation else {
            completePickerCopies(copied, operation: operation)
            return
        }
        guard index < results.count else {
            completePickerCopies(copied, operation: operation)
            return
        }
        let provider = results[index].itemProvider
        guard let identifier = provider.registeredTypeIdentifiers.first(where: {
            guard let type = UTType($0) else { return false }
            return type.conforms(to: .image) || type.conforms(to: .movie)
        }) else {
            completePickerCopies(copied, operation: operation, error: NSError(domain: "RnWebimChat", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unsupported media representation"]))
            return
        }
        provider.loadFileRepresentation(forTypeIdentifier: identifier) { url, error in
            guard let url, error == nil else {
                self.completePickerCopies(copied, operation: operation, error: error ?? NSError(domain: "RnWebimChat", code: 2, userInfo: [NSLocalizedDescriptionKey: "Media file cannot be opened"]))
                return
            }
            do {
                let result = try self.copyPickerFile(url, suggestedName: provider.suggestedName)
                DispatchQueue.main.async {
                    self.loadMediaCopies(results, index: index + 1, copied: copied + [result], operation: operation)
                }
            } catch { self.completePickerCopies(copied, operation: operation, error: error) }
        }
    }
}

extension RnWebimChat: UINavigationControllerDelegate {

}
