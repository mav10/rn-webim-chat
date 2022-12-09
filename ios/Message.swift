//
//  Message.swift
//  WebimClientLibraryWrapper
//


import Foundation
import WebimClientLibrary


// MARK: - Message
@objc(Message)
public final class _ObjCMessage: NSObject {

    // MARK: - Properties
    private (set) var message: Message


    // MARK: - Initialization
    public init(message: Message) {
        self.message = message
    }

    // MARK: - Methods

    @objc(getAttachment)
    public func getAttachment() -> _ObjCMessageAttachment? {
        if let attachment = message.getData()?.getAttachment() {
            return _ObjCMessageAttachment(messageAttachment: attachment)
        }

        return nil
    }

    @objc(getData)
    public func getData() -> [String: Any]? {
        if let data = message.getRawData() {
            var objCData = [String: Any]()
            for key in data.keys {
                if let value = data[key] {
                    objCData[key] = value
                }
            }

            return objCData
        } else {
            return nil
        }
    }

    @objc(getID)
    public func getID() -> String {
        return message.getID()
    }

    @objc(getOperatorID)
    public func getOperatorID() -> String? {
        return message.getOperatorID()
    }

    @objc(getSenderAvatarFullURL)
    public func getSenderAvatarFullURL() -> URL? {
        return message.getSenderAvatarFullURL()
    }

    @objc(getSenderName)
    public func getSenderName() -> String {
        return message.getSenderName()
    }

    @objc(getSendStatus)
    public func getSendStatus() -> _ObjCMessageSendStatus {
        switch message.getSendStatus() {
        case .sending:
            return .SENDING
        case .sent:
            return .SENT
        }
    }

    @objc(getText)
    public func getText() -> String {
        return message.getText()
    }

    @objc(getTime)
    public func getTime() -> Date {
        return message.getTime()
    }

    @objc(getType)
    public func getType() -> _ObjCMessageType {
        switch message.getType() {
        case .actionRequest:
            return .ACTION_REQUEST
        case .contactInformationRequest:
            return .CONTACTS_REQUEST
        case .fileFromOperator:
            return .FILE_FROM_OPERATOR
        case .fileFromVisitor:
            return .FILE_FROM_VISITOR
        case .info:
            return .INFO
        case .operatorMessage:
            return .OPERATOR
        case .operatorBusy:
            return .OPERATOR_BUSY
        case .visitorMessage:
            return .VISITOR
        case .keyboard:
            return .KEYBOARD
        case .keyboardResponse:
            return .KEYBOARD_RESPONSE
        case .stickerVisitor:
            return .VISITOR_STICKER
        }
    }

    @objc(isEqualTo:)
    public func isEqual(to message: _ObjCMessage) -> Bool {
        return self.message.isEqual(to: message.message)
    }

    @objc(isReadByOperator)
    public func isReadByOperator() -> Bool {
        return message.isReadByOperator()
    }

    @objc(canBeEdited)
    public func canBeEdited() -> Bool {
        return message.canBeEdited()
    }
    
    @objc(canBeReplied)
    public func canBeReplied() -> Bool {
        return message.canBeReplied()
    }
    
    @objc(getQuote)
    public func getQuote() -> _ObjCQuote? {
        if let quote = message.getQuote() {
            return _ObjCQuote(quote: quote)
        }

        return nil
    }
    
}


// MARK - Quote (reply)
@objc(Quote)
public final class _ObjCQuote: NSObject {
    // MARK: - Properties
    private let quote: Quote


    // MARK: - Initialization
    public init(quote: Quote) {
        self.quote = quote
    }


    // MARK: - Methods

    @objc(getState)
    public func getState() -> String {
        switch quote.getState() {
        case QuoteState.filled:
            return "FILLED"
        case QuoteState.FILLED:
            return "FILLED"
        case QuoteState.notFound:
            return "NOT_FOUND"
        case QuoteState.NOT_FOUND:
            return "NOT_FOUND"
        case QuoteState.pending:
            return "PENDING"
        case QuoteState.PENDING:
            return "PENDING"
        }
    }

    @objc(getAuthorID)
    public func getAuthorID() -> String {
        return quote.getAuthorID() ?? ""
    }
    
    @objc(getMessageID)
    public func getMessageID() -> String {
        return quote.getMessageID() ?? ""
    }
    
    @objc(getSenderName)
    public func getSenderName() -> String {
        return quote.getSenderName() ?? ""
    }
    
    @objc(getMessageText)
    public func getMessageText() -> String {
        return quote.getMessageText() ?? ""
    }
    
    @objc(getMessageType)
    public func getMessageType() -> NSString? {
        if let messageType = quote.getMessageType() {
            switch messageType {
            case MessageType.contactInformationRequest:
                return "contactInformationRequest"
            case MessageType.operatorMessage:
                return "operatorMessage"
            case MessageType.visitorMessage:
                return "visitorMessage"
            case MessageType.keyboardResponse:
                return "keyboardResponse"
            case MessageType.stickerVisitor:
                return "stickerVisitor"
            case MessageType.keyboard:
                return "keyboard"
            case MessageType.operatorBusy:
                return "operatorBusy"
            case MessageType.info:
                return "info"
            case MessageType.actionRequest:
                return "actionRequest"
            case MessageType.fileFromOperator:
                return "fileFromOperator"
            case MessageType.fileFromVisitor:
                return "fileFromVisitor"
            }
        }
        return nil;
    }
    
    @objc(getMessageTimestamp)
    public func getMessageTimestamp() -> Date? {
        return quote.getMessageTimestamp()
    }
}

// MARK: - MessageAttachment
@objc(MessageAttachment)
public final class _ObjCMessageAttachment: NSObject {

    // MARK: - Properties
    private let messageAttachment: MessageAttachment


    // MARK: - Initialization
    public init(messageAttachment: MessageAttachment) {
        self.messageAttachment = messageAttachment
    }


    // MARK: - Methods

    @objc(getContentType)
    public func getContentType() -> String {
        return messageAttachment.getFileInfo().getContentType() ?? ""
    }

    @objc(getFileName)
    public func getFileName() -> String {
        return messageAttachment.getFileInfo().getFileName()
    }

    @objc(getImageInfo)
    public func getImageInfo() -> _ObjCImageInfo? {
        if let imageInfo = messageAttachment.getFileInfo().getImageInfo() {
            return _ObjCImageInfo(imageInfo: imageInfo)
        }

        return nil
    }

    @objc(getSize)
    public func getSize() -> NSNumber? {
        return messageAttachment.getFileInfo().getSize() as NSNumber?
    }

    @objc(getURL)
    public func getURL() -> URL? {
        return messageAttachment.getFileInfo().getURL()
    }

}

// MARK: - ImageInfo
@objc(ImageInfo)
public final class _ObjCImageInfo: NSObject {

    // MARK: - Properties
    private let imageInfo: ImageInfo


    // MARK: - Initialization
    public init(imageInfo: ImageInfo) {
        self.imageInfo = imageInfo
    }


    // MARK: - Methods

    @objc(getThumbURLString)
    public func getThumbURLString() -> URL {
        return imageInfo.getThumbURL()
    }

    @objc(getHeight)
    public func getHeight() -> NSNumber? {
        return imageInfo.getHeight() as NSNumber?
    }

    @objc(getWidth)
    public func getWidth() -> NSNumber? {
        return imageInfo.getWidth() as NSNumber?
    }

}


// MARK: - MessageType
@objc(MessageType)
public enum _ObjCMessageType: Int {
    case ACTION_REQUEST
    case CONTACTS_REQUEST
    case FILE_FROM_OPERATOR
    case FILE_FROM_VISITOR
    case INFO
    case OPERATOR
    case OPERATOR_BUSY
    case VISITOR
    case VISITOR_STICKER
    case KEYBOARD
    case KEYBOARD_RESPONSE
}

// MARK: - MessageSendStatus
@objc(MessageSendStatus)
public enum _ObjCMessageSendStatus: Int {
    case SENDING
    case SENT
}
