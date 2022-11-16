
#ifdef RCT_NEW_ARCH_ENABLED
#import "RNRnWebimChatSpec.h"

@interface RnWebimChat : NSObject <NativeRnWebimChatSpec>
#else
#import <React/RCTBridgeModule.h>

@interface RnWebimChat : NSObject <RCTBridgeModule>
#endif

@end
