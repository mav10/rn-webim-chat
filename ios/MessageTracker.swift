//
//  MessageTracker.swift
//  WebimClientLibraryWrapper
//


import Foundation
import WebimClientLibrary


// MARK: - MessageTracker
@objc(MessageTracker)
public final class _ObjCMessageTracker: NSObject {

    // MARK: - Properties
    private let messageTracker: MessageTracker


    // MARK: - Initialization
    public init(messageTracker: MessageTracker) {
        self.messageTracker = messageTracker
    }


    // MARK: - Methods

    @objc(getLastMessagesByLimit:completion:error:)
    public func getLastMessages(byLimit limitOfMessages: Int,
                         completion: @escaping (_ result: [_ObjCMessage]) -> ()) throws {
        try messageTracker.getLastMessages(byLimit: limitOfMessages) { messages in
            var objCMessages = [_ObjCMessage]()
            for message in messages {
                objCMessages.append(_ObjCMessage(message: message))
            }
            completion(objCMessages)
        }
    }

    @objc(getNextMessagesByLimit:completion:error:)
    public func getNextMessages(byLimit limitOfMessages: Int,
                         completion: @escaping ([_ObjCMessage]) -> ()) throws {
        try messageTracker.getNextMessages(byLimit: limitOfMessages) { messages in
            var objCMessages = [_ObjCMessage]()
            for message in messages {
                objCMessages.append(_ObjCMessage(message: message))
            }
            completion(objCMessages)
        }
    }

    @objc(getAllMessagesWithCompletion:error:)
    public func getAllMessages(completion: @escaping (_ result: [_ObjCMessage]) -> ()) throws {
        try messageTracker.getAllMessages() { messages in
            var objCMessages = [_ObjCMessage]()
            for message in messages {
                objCMessages.append(_ObjCMessage(message: message))
            }
            completion(objCMessages)
        }
    }

    @objc(resetToMessage:error:)
    public func resetTo(message: _ObjCMessage) throws {
        try messageTracker.resetTo(message: message.message)
    }

    @objc(destroy:)
    public func destroy() throws {
        try messageTracker.destroy()
    }

}
