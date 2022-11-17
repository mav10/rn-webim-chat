//
//  Department.swift
//  ObjectiveCExample
//

import Foundation
import WebimClientLibrary

// MARK: - Department
@objc(Department)
public final class _ObjCDepartment: NSObject {

    // MARK: - Properties
    private let department: Department


    // MARK: - Initialization
    init(department: Department) {
        self.department = department

    }


    // MARK: - Methods

    @objc(getKey)
    func getKey() -> String {
        return department.getKey()
    }

    @objc(getName)
    func getName() -> String {
        return department.getName()
    }

    @objc(getDepartmentOnlineStatus)
    func getDepartmentOnlineStatus() -> _ObjCDepartmentOnlineStatus {
        switch department.getDepartmentOnlineStatus() {
        case .BUSY_OFFLINE:
            return .BUSY_OFFLINE
        case .BUSY_ONLINE:
            return .BUSY_ONLINE
        case .OFFLINE:
            return .OFFLINE
        case .ONLINE:
            return .ONLINE
        case .UNKNOWN:
            return .UNKNOWN
        }
    }

    @objc(getOrder)
    func getOrder() -> Int {
        return department.getOrder()
    }

    @objc(getLocalizedNames)
    func getLocalizedNames() -> [String: String]? {
        return department.getLocalizedNames()
    }

    @objc(getLogoURL)
    func getLogoURL() -> URL? {
        return department.getLogoURL()
    }

}

// MARK: - DepartmentOnlineStatus
@objc(DepartmentOnlineStatus)
enum _ObjCDepartmentOnlineStatus: Int {
    case BUSY_OFFLINE
    case BUSY_ONLINE
    case OFFLINE
    case ONLINE
    case UNKNOWN
}
