//
//  WebimSession.swift
//  WebimClientLibraryWrapper
//


import Foundation
import WebimClientLibrary


// MARK: - WebimSession
@objc(WebimSession)
public final class _ObjCWebimSession: NSObject {

    // MARK: - Properties
    private let webimSession: WebimSession


    // MARK: - Initializers
    public init(webimSession: WebimSession) {
        self.webimSession = webimSession
    }


    // MARK: - Methods

    @objc(resume:)
    public func resume() throws {
        try webimSession.resume()
    }

    @objc(pause:)
    public func pause() throws {
        try webimSession.pause()
    }

    @objc(destroy:)
    public func destroy() throws {
        try webimSession.destroy()
    }

    @objc(destroyWithClearVisitorData:)
    public func destroyWithClearVisitorData() throws {
        try webimSession.destroyWithClearVisitorData()
    }

    @objc(getStream)
    public func getStream() -> _ObjCMessageStream {
        return _ObjCMessageStream(messageStream: webimSession.getStream())
    }

    @objc(changeLocation:error:)
    public func change(location: String) throws {
        try webimSession.change(location: location)
    }

    @objc(setDeviceToken:error:)
    public func set(deviceToken: String) throws {
        try webimSession.set(deviceToken: deviceToken)
    }

}
