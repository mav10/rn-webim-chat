
#ifdef RCT_NEW_ARCH_ENABLED
#import "RNRnWebimChatSpec.h"

@interface RnWebimChat : NSObject <NativeRnWebimChatSpec>
#else
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RnWebimChat : RCTEventEmitter <UIImagePickerControllerDelegate, UINavigationControllerDelegate, RCTBridgeModule>
#endif

@end

