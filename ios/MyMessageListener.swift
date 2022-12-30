//
//  MyMessageListener.swift
//  RnWebimChat
//
//  Created by Maxim Vasin on 28.12.2022.
//

import Foundation
import WebimClientLibrary

public final class MyMessageListener : MessageListener {
    public func added(message newMessage: Message,
               after previousMessage: Message?) {
        
    }
    
    public func removed(message: Message) {}
    
    public func removedAllMessages() {}
    
    public func changed(message oldVersion: Message,
                 to newVersion: Message) {}
}
