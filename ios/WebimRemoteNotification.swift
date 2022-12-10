//
//  WebimRemoteNotification.swift
//  WebimClientLibraryWrapper
//

import Foundation
import WebimClientLibrary

// MARK: - WebimRemoteNotification
@objc(WebimRemoteNotification)
public final class _ObjCWebimRemoteNotification: NSObject {

    // MARK: - Properties
    private let webimRemoteNotification: WebimRemoteNotification


    // MARK: - Initialization
    public init(webimRemoteNotification: WebimRemoteNotification) {
        self.webimRemoteNotification = webimRemoteNotification
    }


    // MARK: - Methods

    @objc(getType)
    public func getType() -> _ObjCNotificationType {
        switch webimRemoteNotification.getType() {
        case .CONTACT_INFORMATION_REQUEST:
            return .CONTACT_INFORMATION_REQUEST
        case .OPERATOR_ACCEPTED:
            return .OPERATOR_ACCEPTED
        case .OPERATOR_FILE:
            return .OPERATOR_FILE
        case .OPERATOR_MESSAGE:
            return .OPERATOR_MESSAGE
        case .WIDGET:
            return .WIDGET
        case .none:
            return .NONE
        case .some(.contactInformationRequest):
            return .CONTACT_INFORMATION_REQUEST
        case .some(.operatorAccepted):
            return .OPERATOR_ACCEPTED
        case .some(.operatorFile):
            return .OPERATOR_FILE
        case .some(.operatorMessage):
            return .OPERATOR_MESSAGE
        case .some(.widget):
            return .WIDGET
        case .some(.rateOperator):
            return .OPERATOR_RATE
        }
    }

    @objc(getEvent)
    public func getEvent() -> _ObjCNotificationEvent {
        if let event = webimRemoteNotification.getEvent() {
            switch event {
            case .ADD:
                return .ADD
            case .DELETE:
                return .DELETE
            case .add:
                return .ADD
            case .delete:
                return .DELETE
            }
        }

        return .NONE
    }

    @objc(getParameters)
    public func getParameters() -> [String] {
        return webimRemoteNotification.getParameters()
    }

}


// MARK: - NotificationType
@objc(NotificationType)
public enum _ObjCNotificationType: Int {
    case CONTACT_INFORMATION_REQUEST
    case OPERATOR_ACCEPTED
    case OPERATOR_FILE
    case OPERATOR_MESSAGE
    case OPERATOR_RATE
    case WIDGET
    case NONE
}

// MARK: - NotificationEvent
@objc(NotificationEvent)
public enum _ObjCNotificationEvent: Int {
    case NONE
    case ADD
    case DELETE
}
