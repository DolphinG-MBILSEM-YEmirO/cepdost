# Wires Sharloop's native iOS code into the Xcode project Capacitor
# generates (ios/App/App.xcodeproj), so nobody has to click through Xcode:
#
#   - adds our app files (MainViewController, SharloopWidgetsPlugin) to App
#   - creates the SharloopWidgets widget extension target (iOS 17) with our
#     widget files and embeds it in the app
#   - gives both targets the App Group group.app.sharloop (entitlements)
#   - bundles a privacy manifest (PrivacyInfo.xcprivacy) in both targets,
#     which App Store uploads require
#   - shares an "App" scheme, so command-line builds can find it
#
# Safe to run again: anything already in place is left alone. Run it after
# `cap add ios` and before `node scripts/apply-native.mjs ios` (which copies
# the files into the folders this script points at).
#
#   ruby scripts/setup-ios-project.rb
#
# Needs the xcodeproj gem (comes with CocoaPods; else `gem install xcodeproj`).

require 'fileutils'
require 'xcodeproj'

ROOT = File.expand_path('..', __dir__)
PROJECT_PATH = File.join(ROOT, 'ios/App/App.xcodeproj')
NATIVE = File.join(ROOT, 'native/ios')

EXTENSION = 'SharloopWidgets'
BUNDLE_ID = 'app.sharloop'
WIDGET_MIN_IOS = '17.0'

abort "#{PROJECT_PATH} not found; run `npx cap add ios` first." unless File.exist?(PROJECT_PATH)

project = Xcodeproj::Project.open(PROJECT_PATH)
app = project.targets.find { |t| t.name == 'App' } or abort 'The App target is missing from the project.'

def swift_files(folder)
  Dir.children(folder).select { |f| f.end_with?('.swift') }.sort
end

PRIVACY_MANIFEST = 'PrivacyInfo.xcprivacy'

# Adds files that live in `group`'s folder to the group, the Swift ones to
# `target`'s sources and the privacy manifest to its resources, skipping any
# already there.
def add_files(group, target, names)
  names.each do |name|
    next if group.files.any? { |f| f.path == name }
    ref = group.new_reference(name)
    target.add_file_references([ref]) if name.end_with?('.swift')
    target.add_resources([ref]) if name == PRIVACY_MANIFEST
  end
end

def set_everywhere(target, settings)
  target.build_configurations.each { |config| config.build_settings.merge!(settings) }
end

# ---------- the app ----------

app_group = project.main_group.children.find { |g| g.display_name == 'App' } or abort 'The App group is missing.'
add_files(app_group, app, swift_files(File.join(NATIVE, 'App')) + ['App.entitlements', PRIVACY_MANIFEST])
set_everywhere(app, 'CODE_SIGN_ENTITLEMENTS' => 'App/App.entitlements')

# ---------- the widget extension ----------

extension = project.targets.find { |t| t.name == EXTENSION }
unless extension
  extension = project.new_target(:app_extension, EXTENSION, :ios, WIDGET_MIN_IOS, nil, :swift)

  app.add_dependency(extension)
  embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } ||
          app.new_copy_files_build_phase('Embed Foundation Extensions')
  embed.symbol_dst_subfolder_spec = :plug_ins
  embed.add_file_reference(extension.product_reference).settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end

set_everywhere(
  extension,
  'PRODUCT_NAME' => '$(TARGET_NAME)',
  'PRODUCT_BUNDLE_IDENTIFIER' => "#{BUNDLE_ID}.#{EXTENSION}",
  'IPHONEOS_DEPLOYMENT_TARGET' => WIDGET_MIN_IOS,
  'INFOPLIST_FILE' => "#{EXTENSION}/Info.plist",
  'GENERATE_INFOPLIST_FILE' => 'YES',
  'INFOPLIST_KEY_CFBundleDisplayName' => 'Sharloop',
  'INFOPLIST_KEY_NSHumanReadableCopyright' => '',
  'CODE_SIGN_ENTITLEMENTS' => "#{EXTENSION}/#{EXTENSION}.entitlements",
  'CODE_SIGN_STYLE' => 'Automatic',
  # Same version as the app, or App Store Connect rejects the upload.
  'MARKETING_VERSION' => app.build_configurations.first.build_settings['MARKETING_VERSION'] || '1.0',
  'CURRENT_PROJECT_VERSION' => app.build_configurations.first.build_settings['CURRENT_PROJECT_VERSION'] || '1',
  'SWIFT_VERSION' => '5.0',
  'TARGETED_DEVICE_FAMILY' => '1,2',
  'SKIP_INSTALL' => 'YES',
  'APPLICATION_EXTENSION_API_ONLY' => 'YES',
  'LD_RUNPATH_SEARCH_PATHS' => '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks',
)

widget_folder = File.join(ROOT, 'ios/App', EXTENSION)
FileUtils.mkdir_p(widget_folder)
widget_group = project.main_group.children.find { |g| g.display_name == EXTENSION } ||
               project.main_group.new_group(EXTENSION, EXTENSION)
add_files(widget_group, extension,
          swift_files(File.join(NATIVE, EXTENSION)) + ['Info.plist', "#{EXTENSION}.entitlements", PRIVACY_MANIFEST])

project.save

# ---------- a shared scheme for command-line builds ----------

schemes = Xcodeproj::XCScheme.shared_data_dir(PROJECT_PATH)
unless File.exist?(File.join(schemes, 'App.xcscheme'))
  scheme = Xcodeproj::XCScheme.new
  scheme.configure_with_targets(app, nil, launch_target: true)
  scheme.save_as(PROJECT_PATH, 'App', true)
end

puts "iOS: App target wired, #{EXTENSION} extension ready (iOS #{WIDGET_MIN_IOS}+), App Group set, App scheme shared."
