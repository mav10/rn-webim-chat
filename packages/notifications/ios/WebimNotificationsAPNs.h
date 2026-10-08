#import <React/RCTEventEmitter.h>
#import <UserNotifications/UserNotifications.h>

@interface WebimNotificationsAPNs : RCTEventEmitter <RCTBridgeModule>
+ (void)didRegisterDeviceToken:(NSData *)deviceToken;
+ (void)didFailRegistration;
+ (BOOL)receivePayload:(NSDictionary *)payload foreground:(BOOL)foreground;
+ (BOOL)openPayload:(NSDictionary *)payload;
+ (BOOL)presentationForNotification:(UNNotification *)notification
                           options:(UNNotificationPresentationOptions *)options;
+ (void)setAccount:(NSString *)account user:(NSString *)user;
@end