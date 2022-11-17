//
//  MessageListener.swift
//  WebimClientLibraryWrapper
//


import Foundation
import WebimClientLibrary


// MARK: - MessageListener
@objc(MessageListener)
public protocol _ObjCMessageListener {

    @objc(addedMessage:after:)
    func added(message newMessage: _ObjCMessage,
               after previousMessage: _ObjCMessage?)

    @objc(removedMessage:)
    func removed(message: _ObjCMessage)

    @objc(removedAllMessages)
    func removedAllMessages()

    @objc(changedMessage:to:)
    func changed(message oldVersion: _ObjCMessage,
                 to newVersion: _ObjCMessage)

}


// MARK: - Protocols' wrappers
// MARK: - MessageListener
public final class MessageListenerWrapper: MessageListener {

    // MARK: - Properties
    private weak var messageListener: _ObjCMessageListener?


    // MARK: - Initialization
    init(messageListener: _ObjCMessageListener) {
        self.messageListener = messageListener
    }


    // MARK: - Methods
    // MARK: MessageListener methods

    public func added(message newMessage: Message,
               after previousMessage: Message?) {
        messageListener?.added(message: _ObjCMessage(message: newMessage),
                              after: ((previousMessage == nil) ? nil : _ObjCMessage(message: previousMessage!)))
    }

    public func removed(message: Message) {
        messageListener?.removed(message: _ObjCMessage(message: message))
    }

    public func removedAllMessages() {
        messageListener?.removedAllMessages()
    }

    public func changed(message oldVersion: Message,
                 to newVersion: Message) {
        messageListener?.changed(message: _ObjCMessage(message: oldVersion),
                                to: _ObjCMessage(message: newVersion))
    }

}
