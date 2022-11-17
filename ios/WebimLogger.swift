//
//  WebimLogger.swift
//  WebimClientLibraryWrapper
//

import Foundation
import WebimClientLibrary

// MARK: - WebimLogger
@objc(WebimLogger)
public protocol _ObjCWebimLogger {

    @objc(logEntry:)
    func log(entry: String)

}

// MARK: - Protocols' wrappers
// MARK: - WebimLogger
public final class WebimLoggerWrapper: WebimLogger {

    // MARK: - Properties
    private let webimLogger: _ObjCWebimLogger

    // MARK: - Initialization
    public init(webimLogger: _ObjCWebimLogger) {
        self.webimLogger = webimLogger
    }

    public func log(entry: String) {
        webimLogger.log(entry: entry)
    }

}
