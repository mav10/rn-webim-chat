//
//  ProvidedAuthorizationTokenStateListener.swift
//  ObjectiveCExample
//

import Foundation
import WebimClientLibrary

@objc(ProvidedAuthorizationTokenStateListener)
public protocol _ObjCProvidedAuthorizationTokenStateListener {

    @objc(updateProvidedAuthorizationToken:)
    func update(providedAuthorizationToken: String)

}

// MARK: - Protocols' wrappers
// MARK: - ProvidedAuthorizationTokenStateListener
public final class ProvidedAuthorizationTokenStateListenerWrapper: ProvidedAuthorizationTokenStateListener {

    // MARK: - Properties
    private let providedAuthorizationTokenStateListener: _ObjCProvidedAuthorizationTokenStateListener

    // MARK: - Initialization
    public init(providedAuthorizationTokenStateListener: _ObjCProvidedAuthorizationTokenStateListener) {
        self.providedAuthorizationTokenStateListener = providedAuthorizationTokenStateListener
    }

    // MARK: - Methods
    // MARK: ProvidedAuthorizationTokenStateListener protocol methods
    public func update(providedAuthorizationToken: String) {
        providedAuthorizationTokenStateListener.update(providedAuthorizationToken: providedAuthorizationToken)
    }

}
