//
//  WebimError.swift
//  WebimClientLibraryWrapper
//


import Foundation
import WebimClientLibrary


// MARK: - WebimError
@objc(WebimError)
public final class _ObjCWebimError: NSObject {

    // MARK: - Properties
    private let webimError: WebimError


    // MARK: - Initialization
    init(webimError: WebimError) {
        self.webimError = webimError
    }


    // MARK: - Methods

    @objc(getErrorType)
    func getErrorType() -> _ObjCFatalErrorType {
        switch webimError.getErrorType() {
        case .accountBlocked:
            return .ACCOUNT_BLOCKED
        case .providedVisitorFieldsExpired:
            return .PROVIDED_VISITOR_FIELDS_EXPIRED
        case .unknown:
            return .UNKNOWN
        case .visitorBanned:
            return .VISITOR_BANNED
        case .wrongProvidedVisitorHash:
            return .WRONG_PROVIDED_VISITOR_HASH
        }
    }

    @objc(getErrorString)
    func getErrorString() -> String {
        return webimError.getErrorString()
    }

}


// MARK: - FatalErrorType
@objc(FatalErrorType)
public enum _ObjCFatalErrorType: Int {
    case ACCOUNT_BLOCKED
    case PROVIDED_VISITOR_FIELDS_EXPIRED
    case UNKNOWN
    case VISITOR_BANNED
    case WRONG_PROVIDED_VISITOR_HASH
}
