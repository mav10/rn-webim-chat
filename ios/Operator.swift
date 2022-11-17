//
//  Operator.swift
//  WebimClientLibraryWrapper
//


import Foundation
import WebimClientLibrary


// MARK: - Operator
@objc(Operator)
public final class _ObjCOperator: NSObject {

    // MARK: - Private
    private let `operator`: Operator


    // MARK: - Initialization
    public init(operator: Operator) {
        self.`operator` = `operator`
    }


    // MARK: - Methods

    @objc(getID)
    public func getID() -> String {
        return `operator`.getID()
    }

    @objc(getName)
    public func getName() -> String {
        return `operator`.getName()
    }

    @objc(getAvatarURL)
    public func getAvatarURL() -> URL? {
        return `operator`.getAvatarURL()
    }

}
