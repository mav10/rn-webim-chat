//
//  FatalErrorHandler.swift
//  WebimClientLibraryWrapper
//

import Foundation
import WebimClientLibrary

// MARK: - FatalErrorHandler
@objc(FatalErrorHandler)
public protocol _ObjCFatalErrorHandler {

    @objc(onError:)
    func on(error: _ObjCWebimError)

}
