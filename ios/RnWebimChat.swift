import WebimClientLibrary
import Foundation


@objc(RnWebimChat)
open class RnWebimChat: RCTEventEmitter, MessageListener, OperatorTypingListener, UnreadByVisitorMessageCountChangeListener, FatalErrorHandler, NotFatalErrorHandler, SendFileCompletionHandler {
    
    var chatSession: WebimSession?
    var messageStream: MessageStream!
    var messageTracker: MessageTracker?

    private var pickerController: UIImagePickerController;
    private weak var delegate: ImagePickerDelegate?;
    var resolveAttachCallback: RCTResponseSenderBlock?;
    var rejectAttachCallback: RCTResponseSenderBlock?;

    var resolveSendingAttachCallback: RCTResponseSenderBlock?;
    var rejectSendingAttachCallback: RCTResponseSenderBlock?;

    // SendFileCompletionHandler - success callback
    public func onSuccess(messageID: String) {
        resolveSendingAttachCallback!([["id": messageID]])
    }

    // SendFileCompletionHandler - fail callback
    public func onFailure(messageID: String, error: SendFileError) {
        resolveSendingAttachCallback!([["code": "Code 1", "text": "Text 2" + messageID, "error": error.localizedDescription]])
    }


    override init() {
        self.pickerController = UIImagePickerController();
        super.init();
        self.pickerController.delegate = self
        self.pickerController.allowsEditing = true
        self.pickerController.mediaTypes = ["public.image"]
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
            let pushToken: String? = builderData.value(forKey: "pushToken") as? String;
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

            if(pushToken != nil) {
                sessionBuilder = sessionBuilder
                    .set(remoteNotificationSystem: .apns)
                    .set(deviceToken: pushToken)
            }

            if(prechat != nil) {
                sessionBuilder = sessionBuilder.set(prechat: prechat!)
            }
            do {
                chatSession = try sessionBuilder.build()
                chatSession = nil
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

        do {
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
        if(messageStream != nil) {
            do {
                try messageStream.closeChat()
                messageStream = nil
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

        if (messageTracker != nil) {
            messageTracker = nil
        }

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
        do {
            let currentOperator = try messageStream.getCurrentOperator();
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
        } catch {
            handleError(rejecter: reject, errorCode: "UNKNOWN", message: "Can not rate an operator. Details: " + error.localizedDescription, isFatal: true)
        }
    }

    @objc(tryAttachFile:withResolver:)
    func tryAttachFile(reject: @escaping RCTResponseSenderBlock, resolve: @escaping RCTResponseSenderBlock) -> Void {
            DispatchQueue.main.async {
              self.resolveAttachCallback = resolve
              self.rejectAttachCallback = reject
              let view = RCTPresentedViewController()
              view?.present(self.pickerController, animated: true)
            }
    }

    @objc(sendFile:withName:withMime:withExtention:withRejecter:withResolver:)
    func sendFile(uri: String, name: String, mime: String, extention: String, reject: @escaping RCTResponseSenderBlock, resolve: @escaping RCTResponseSenderBlock) {
        do {
            self.resolveSendingAttachCallback = resolve
            self.rejectSendingAttachCallback = reject
            let imageData = try Data(contentsOf: URL(string: uri)!)
            _ = try messageStream.send(file: imageData, filename: name, mimeType: mime, completionHandler: self)
        } catch {
            reject([error])
        }
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
        self.sendEvent(withName: "removeMessage", body: self.messageToJson(message: message))
    }

    public func removedAllMessages() {
        self.sendEvent(withName: "allMessagesRemoved", body: [])
    }

    public func changed(message oldVersion: Message, to newVersion: Message) {
        self.sendEvent(withName: "changedMessage", body: ["from": self.messageToJson(message: oldVersion), "to": self.messageToJson(message: newVersion)])
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

            "operatorId": message.getOperatorID(),
            "quote": message.getQuote() != nil ? self.quetoToDictionary(quote: message.getQuote()!) : nil,
            "attachment": message.getData()?.getAttachment() != nil ? self.attachmentToJson(attachment: message.getData()?.getAttachment()) : nil,
        ] as [String : Any?]

        return result
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
        return [
            "contentType": attachment?.getFileInfo().getContentType(),
            "info": attachment?.getFileInfo().getImageInfo()?.getThumbURL().absoluteString,
            "name": attachment?.getFileInfo().getFileName(),
            "size": attachment?.getFileInfo().getSize(),
            "url": attachment?.getFileInfo().getURL()?.absoluteString
        ];
    }
    
    func fatalErrorToString(error: FatalErrorType) -> String {
        switch error {
        case .accountBlocked:
            return "ACCOUNT_BLOCKED"
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

class SendFilesCompletionWrapper : SendFileCompletionHandler {
    let resolver: RCTResponseSenderBlock
    let rejecter: RCTResponseSenderBlock

    init(resolve: @escaping RCTResponseSenderBlock,  reject: @escaping RCTResponseSenderBlock) {
        self.resolver = resolve
        self.rejecter = reject
    }

    func onSuccess(messageID: String) {
        resolver([["id": messageID]])
    }

    func onFailure(messageID: String, error: SendFileError) {
        rejecter([["code": "Code 1", "text": "Text 2" + messageID, "error": error.localizedDescription]])
    }
}

public protocol ImagePickerDelegate: AnyObject {
    func didSelect(image: UIImage?)
}

extension RnWebimChat: UIImagePickerControllerDelegate {
  public func imagePickerController(_ picker: UIImagePickerController,
                                    didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
    if let imgUrl = info[UIImagePickerController.InfoKey.imageURL] as? URL {
        let imgName = imgUrl.lastPathComponent
        let documentDirectory = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true).first
        let localPath = documentDirectory?.appending(imgName)
        let image = info[UIImagePickerController.InfoKey.originalImage] as! UIImage
        let data = image.pngData()! as NSData
        data.write(toFile: localPath!, atomically: true)
        let photoURL = URL.init(fileURLWithPath: localPath!)

        let extensionName = photoURL.pathExtension.lowercased()
        self.pickerController(picker)
        self.resolveAttachCallback!([[
            "uri": photoURL.absoluteString,
            "name": imgName,
            "mime": "image/" + extensionName,
            "extension": extensionName
        ]])
    }
  }
}

extension RnWebimChat: UINavigationControllerDelegate {

}
