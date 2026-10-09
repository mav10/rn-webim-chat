#import "WebimNotificationsAPNs.h"
#import <UIKit/UIKit.h>
#import <math.h>

static NSString * const QueueKey = @"WebimNotificationsAPNs.queue.v1";
static NSString * const OwnerKey = @"WebimNotificationsAPNs.owner.v1";
static NSString * const TokenKey = @"WebimNotificationsAPNs.token.v1";
static __weak WebimNotificationsAPNs *Emitter;
static BOOL Listening = NO;
static BOOL LocalForeground = NO;
static NSString *ConfiguredLocation;
static NSString *VisibleLocation;
static NSString *VisibleChat;

@implementation WebimNotificationsAPNs
RCT_EXPORT_MODULE();
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
- (NSArray<NSString *> *)supportedEvents { return @[@"WebimAPNs"]; }
- (void)startObserving { Emitter = self; Listening = YES; }
- (void)stopObserving { Listening = NO; Emitter = nil; }

+ (NSArray *)prunedQueue {
  NSArray *stored = [[NSUserDefaults standardUserDefaults] arrayForKey:QueueKey] ?: @[];
  NSMutableArray *queue = [NSMutableArray new];
  NSTimeInterval now = NSDate.date.timeIntervalSince1970;
  for (id entry in stored) {
    if (![entry isKindOfClass:NSDictionary.class]) continue;
    NSNumber *time = entry[@"time"];
    if ([time isKindOfClass:NSNumber.class] && now - time.doubleValue < 300 && now >= time.doubleValue) {
      [queue addObject:entry];
    }
  }
  if (queue.count > 64) [queue removeObjectsInRange:NSMakeRange(0, queue.count - 64)];
  return queue;
}

+ (void)emit:(NSDictionary *)event {
  void (^deliver)(void) = ^{
    NSMutableDictionary *owned = [event mutableCopy];
    NSDictionary *owner = [[NSUserDefaults standardUserDefaults] dictionaryForKey:OwnerKey];
    if (owner && !owned[@"identity"]) owned[@"identity"] = owner;
    if (!owner && owned[@"payload"]) owned[@"identity"] = @{@"accountName": @"", @"userId": @""};
    if (Listening && Emitter) {
      [Emitter sendEventWithName:@"WebimAPNs" body:owned];
    } else {
      NSMutableArray *queue = [[self prunedQueue] mutableCopy];
      NSDictionary *payload = owned[@"payload"];
      if (payload) {
        NSMutableDictionary *minimal = [payload mutableCopy];
        NSMutableDictionary *alert = [payload[@"aps"][@"alert"] mutableCopy];
        alert[@"loc-args"] = @[];
        minimal[@"aps"] = @{@"alert": alert};
        owned[@"payload"] = minimal;
        if ([owned[@"kind"] isEqual:@"receive"]) owned[@"foreground"] = @NO;
      }
      owned[@"time"] = @(NSDate.date.timeIntervalSince1970);
      [queue addObject:owned];
      if (queue.count > 64) [queue removeObjectAtIndex:0];
      [[NSUserDefaults standardUserDefaults] setObject:queue forKey:QueueKey];
    }
  };
  if (NSThread.isMainThread) deliver(); else dispatch_async(dispatch_get_main_queue(), deliver);
}

+ (NSDictionary *)filteredPayload:(NSDictionary *)payload {
  id marker = payload[@"webim"];
  if (![marker isKindOfClass:NSNumber.class] ||
      CFGetTypeID((__bridge CFTypeRef)marker) != CFBooleanGetTypeID() || ![marker boolValue]) return nil;
  NSDictionary *aps = payload[@"aps"];
  if (![aps isKindOfClass:NSDictionary.class]) return nil;
  NSDictionary *alert = aps[@"alert"];
  if (![alert isKindOfClass:NSDictionary.class]) return nil;
  if (![@[@"P.OM", @"P.OF", @"P.OA", @"P.CR", @"P.WM", @"P.RO"] containsObject:alert[@"loc-key"] ?: @""]) return nil;
  NSString *event = alert[@"event"];
  if (![@[@"add", @"del"] containsObject:event ?: @""]) return nil;
  NSArray *parameters = alert[@"loc-args"];
  if (!parameters && [event isEqual:@"del"]) parameters = @[];
  if (![parameters isKindOfClass:NSArray.class]) return nil;
  for (id parameter in parameters) if (![parameter isKindOfClass:NSString.class]) return nil;
  id location = payload[@"location"];
  if (location && ![location isKindOfClass:NSString.class]) return nil;
  id unread = payload[@"unread_by_visitor_msg_cnt"];
  if (unread) {
    if (![unread isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)unread) == CFBooleanGetTypeID()) return nil;
    double count = [unread doubleValue];
    if (!isfinite(count) || count < 0 || count > 9007199254740991.0 || floor(count) != count) return nil;
  }
  NSMutableDictionary *cleanAlert = [NSMutableDictionary new];
  for (NSString *key in @[@"loc-key", @"loc-args", @"event"]) {
    if (alert[key]) cleanAlert[key] = alert[key];
  }
  cleanAlert[@"loc-args"] = parameters;
  NSMutableDictionary *clean = [@{@"webim": @YES, @"aps": @{@"alert": cleanAlert}} mutableCopy];
  for (NSString *key in @[@"location", @"unread_by_visitor_msg_cnt", @"messageId", @"chatId"]) {
    if (payload[key]) clean[key] = payload[key];
  }
  if (![NSJSONSerialization isValidJSONObject:clean]) return nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:clean options:0 error:nil];
  return data.length <= 65536 ? clean : nil;
}

+ (void)setAccount:(NSString *)account user:(NSString *)user {
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  NSDictionary *owner = @{@"accountName": account, @"userId": user};
  NSDictionary *old = [defaults dictionaryForKey:OwnerKey];
  if (old && ![old isEqual:owner]) [defaults removeObjectForKey:QueueKey];
  [defaults setObject:owner forKey:OwnerKey];
}

+ (void)didRegisterDeviceToken:(NSData *)deviceToken {
  const unsigned char *bytes = deviceToken.bytes;
  NSMutableString *token = [NSMutableString stringWithCapacity:deviceToken.length * 2];
  for (NSUInteger index = 0; index < deviceToken.length; index++) [token appendFormat:@"%02x", bytes[index]];
  [[NSUserDefaults standardUserDefaults] setObject:token forKey:TokenKey];
  [self emit:@{@"kind": @"token", @"token": token}];
}
+ (void)didFailRegistration { [self emit:@{@"kind": @"error"}]; }
+ (BOOL)receivePayload:(NSDictionary *)payload foreground:(BOOL)foreground {
  NSDictionary *clean = [self filteredPayload:payload];
  if (!clean) return NO;
  [self emit:@{@"kind": @"receive", @"payload": clean, @"foreground": @(foreground)}];
  return YES;
}
+ (BOOL)openPayload:(NSDictionary *)payload {
  NSDictionary *clean = [self filteredPayload:payload];
  if (!clean) return NO;
  [self emit:@{@"kind": @"open", @"payload": clean}];
  return YES;
}
+ (BOOL)presentationForNotification:(UNNotification *)notification options:(UNNotificationPresentationOptions *)options {
  NSDictionary *payload = notification.request.content.userInfo;
  if (!options || ![self filteredPayload:payload]) return NO;
  NSString *location = payload[@"location"] ?: ConfiguredLocation;
  BOOL visible = VisibleLocation && [location isEqual:VisibleLocation] &&
    (!VisibleChat || [payload[@"chatId"] isEqual:VisibleChat]);
  BOOL deleted = [payload[@"aps"][@"alert"][@"event"] isEqual:@"del"];
  *options = (visible || deleted || LocalForeground) ? UNNotificationPresentationOptionNone :
    (UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionList | UNNotificationPresentationOptionSound);
  return YES;
}

RCT_EXPORT_METHOD(configure:(NSString *)account userId:(NSString *)user location:(NSString *)location localForeground:(BOOL)localForeground) {
  [WebimNotificationsAPNs setAccount:account user:user];
  LocalForeground = localForeground;
  ConfiguredLocation = location;
}
RCT_EXPORT_METHOD(setVisible:(NSString *)location chatId:(NSString *)chatId) {
  VisibleLocation = (id)location == NSNull.null ? nil : location;
  VisibleChat = (id)chatId == NSNull.null ? nil : chatId;
}
RCT_EXPORT_METHOD(register) { [UIApplication.sharedApplication registerForRemoteNotifications]; }
RCT_REMAP_METHOD(drain, drainWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  NSMutableArray *queue = [[WebimNotificationsAPNs prunedQueue] mutableCopy];
  [[NSUserDefaults standardUserDefaults] removeObjectForKey:QueueKey];
  NSString *token = [[NSUserDefaults standardUserDefaults] stringForKey:TokenKey];
  if (token) [queue addObject:@{@"kind": @"token", @"token": token}];
  resolve(queue);
}
RCT_REMAP_METHOD(clear, clearWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [[NSUserDefaults standardUserDefaults] removeObjectForKey:QueueKey];
  [[NSUserDefaults standardUserDefaults] removeObjectForKey:OwnerKey];
  VisibleLocation = nil;
  VisibleChat = nil;
  LocalForeground = NO;
  ConfiguredLocation = nil;
  resolve(nil);
}
@end