import WebimClientLibrary

@objc(RnWebimChat)
class RnWebimChat: NSObject {
    
    var chatSession: WebimSession?
    var messageStream: MessageStream!
    var messageTracker: MessageTracker?

    @objc(resumeSession:withResolver:withRejecter:)
    func resumeSession(builderData: NSDictionary, resolve:RCTPromiseResolveBlock, reject:RCTPromiseRejectBlock) -> Void {
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
            } catch {
                reject("Initi result failed", "Failure text", error)
            }
        }
        
        do {
            try chatSession?.resume()
        } catch {
            reject("Resume result failed", "Failure text", nil)
        }
        
        do {
            messageStream = chatSession!.getStream();
            try messageStream.setChatRead();
            try messageTracker = messageStream.newMessageTracker(messageListener: MyMessageListener())
            try messageStream.startChat();
        } catch {
            reject("Start chat failed", "Failure text", error)
        }
        
        resolve(nil)
  }
    
    @objc(destroySession:withResolver:withRejecter:)
    func destroySession(clearuserData: Bool, resolve:RCTPromiseResolveBlock, reject:RCTPromiseRejectBlock) -> Void {
        if(messageStream != nil) {
            do {
                try messageStream.closeChat()
                messageStream = nil
            } catch {
                reject(error.localizedDescription,  "Error 2 text", error)
            }
        }
        
        if(chatSession != nil) {
            do {
                if(clearuserData) {
                    try chatSession?.destroyWithClearVisitorData()
                } else {
                    try chatSession?.destroy()
                }
            } catch {
                reject(error.localizedDescription,  "Error 2 text", error)
            }
            
            chatSession = nil
        }
        
        if (messageTracker != nil) {
            do {
                try messageTracker?.destroy()
                messageTracker = nil
            } catch {
                reject(error.localizedDescription,  "Error 2 text", error)
            }
        }
        
        resolve(nil)
    }
    
    @objc(getAllMessages:withRejecter:)
    func getAllMessages(resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        do {
            try messageTracker?.getAllMessages(completion: { result in
                var messages: [[String: Any]] = []
                for message in result {
                    messages.append(self.messageToJson(message: message))
                }

                resolve(messages)
            })
        } catch {
            reject(error.localizedDescription,  "Error 2 text", error)
        }
    }
    
    @objc(getLastMessages:withResolver:withRejecter:)
    func getLastMessages(limit: Int, resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        do {
            try messageTracker?.getLastMessages(byLimit: limit, completion: { result in
                resolve(result)
            })
        } catch {
            reject(error.localizedDescription,  "Error 2 text", error)
        }
    }
    
    @objc(getNextMessages:withResolver:withRejecter:)
    func getNextMessages(limit: Int, resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        do {
            try messageTracker?.getNextMessages(byLimit: limit, completion: { result in
                resolve(result)
            })
        } catch {
            reject(error.localizedDescription,  "Error 2 text", error)
        }
    }
    
    @objc(send:withResolver:withRejecter:)
    func send(message: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) -> Void {
        do {
            let _id = try messageStream!.send(message: message)
            resolve(_id);
        } catch {
            reject(error.localizedDescription,  "Error 2 text", error)
        }
    }
    
    //This method is used to convert jsonstring to dictionary [String:Any]
    func jsonToDictionary(from text: String) -> [String: Any]? {
        guard let data = text.data(using: .utf8) else { return nil }
        let anyResult = try? JSONSerialization.jsonObject(with: data, options: [])
        return anyResult as? [String: Any]
    }

    
    func messageToJson(message: Message) -> [String: Any] {
        var result = [
            "id": message.getID(),
            "time": message.getTime().timeIntervalSince1970 * 1000,
            "type": message.getType(),
            "text": message.getText(),
            "name": message.getSenderName(),
            "status": message.getSendStatus(),
            "avatar": message.getSenderAvatarFullURL()?.absoluteURL,
            "read": message.isReadByOperator(),
            "canEdit": message.canBeEdited(),
            "canReply": message.canBeReplied(),
            "canReact": message.canVisitorReact(),
            "canChangeReaction": message.canVisitorChangeReaction(),
            "isEdited": message.isEdited(),
            
            "quote": message.getQuote(),
            "attachment": message.getData()?.getAttachment(),
        ] as [String : Any]

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
        case .keyboard
            return "KEYBOARD";
        case .keyboardResponse:
            return "KEYBOARD_RESPONSE"
        default:
            return "";
            }
    }
}
