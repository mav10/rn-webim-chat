require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
Pod::Spec.new do |spec|
  spec.name = 'RnWebimChatNotifications'
  spec.version = package['version']
  spec.summary = package['description']
  spec.homepage = 'https://github.com/mav10/rn-webim-chat'
  spec.license = package['license']
  spec.author = 'rn-webim-chat contributors'
  spec.platforms = { :ios => '15.1' }
  spec.source = { :git => 'https://github.com/mav10/rn-webim-chat.git', :tag => spec.version.to_s }
  spec.source_files = 'ios/*.{h,m}'
  spec.public_header_files = 'ios/*.h'
  spec.dependency 'React-Core'
  spec.frameworks = 'UIKit', 'UserNotifications'
end