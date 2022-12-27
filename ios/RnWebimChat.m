#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(RnWebimChat, NSObject)

RCT_EXTERN_METHOD(resumeSession:(NSDictionary*)builderData
                  withRejecter:(RCTResponseSenderBlock)reject
                  withResolver:(RCTResponseSenderBlock)resolve)

RCT_EXTERN_METHOD(destroySession:(nonnull NSNumber*)clearUserData
                  withRejecter:(RCTResponseSenderBlock)reject
                  withResolver:(RCTResponseSenderBlock)resolve)

RCT_EXTERN_METHOD(getLastMessages:(nonnull NSNumber*)limit
                  withRejecter:(RCTResponseSenderBlock)reject
                  withResolver:(RCTResponseSenderBlock)resolve)

RCT_EXTERN_METHOD(getNextMessages:(NSNumber*)limit
                  withRejecter:(RCTResponseSenderBlock)reject
                  withResolver:(RCTResponseSenderBlock)resolve)

RCT_EXTERN_METHOD(getAllMessages:
                  (RCTResponseSenderBlock)reject
                  withResolver:(RCTResponseSenderBlock)resolve)

RCT_EXTERN_METHOD(rateOperator:(NSNumber*)rating
                  withRejecter:(RCTResponseSenderBlock)reject
                  resolve:(RCTResponseSenderBlock)resolve)

RCT_EXTERN_METHOD(tryAttachFile:
                  (RCTResponseSenderBlock)reject
                  withResolver:(RCTResponseSenderBlock)resolve)

RCT_EXTERN_METHOD(sendFile:(NSString*)uri withName:(NSString*)name withMime:(NSString*)mime withExtention:(NSString*)extention
                  withRejecter:(RCTResponseSenderBlock)reject
                  withResolver:(RCTResponseSenderBlock)resolve)

RCT_EXTERN_METHOD(send:(NSString*)message
                  withRejecter:(RCTResponseSenderBlock)reject
                  withResolver:(RCTResponseSenderBlock)resolve)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
