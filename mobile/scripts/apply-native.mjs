// Copies Sharloop's own native code (native/) into the projects Capacitor
// generates (android/, ios/) and wires it up. Safe to run again after every
// `cap sync`: files are overwritten, edits are only made once.
//
//   node scripts/apply-native.mjs            both platforms that exist
//   node scripts/apply-native.mjs android    only Android
//   node scripts/apply-native.mjs ios        only iOS

import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const only = process.argv[2]

function patch(file, marker, edit) {
  const text = readFileSync(file, 'utf8')
  if (text.includes(marker)) return
  const next = edit(text)
  if (next === text) throw new Error(`Could not patch ${file}; see mobile/KURULUM.md for the manual step.`)
  writeFileSync(file, next)
}

function android() {
  const app = join(root, 'android/app/src/main')
  if (!existsSync(app)) return console.log('android/ not found, skipped (run `npm run add:android` first).')
  cpSync(join(root, 'native/android/java'), join(app, 'java'), { recursive: true })
  cpSync(join(root, 'native/android/res'), join(app, 'res'), { recursive: true })

  const receivers = [
    ['NextPlanWidget', 'next_plan'],
    ['FreeFriendsWidget', 'free_friends'],
    ['OnThisDayWidget', 'on_this_day'],
  ]
    .map(
      ([cls, id]) => `
        <receiver android:name=".widgets.${cls}" android:exported="false" android:label="@string/widget_${id}_name">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_${id}_info" />
        </receiver>`,
    )
    .join('')
  patch(join(app, 'AndroidManifest.xml'), 'widgets.NextPlanWidget', (t) =>
    t.replace('</application>', `        <!-- Sharloop home-screen widgets -->${receivers}\n    </application>`),
  )
  console.log('Android: widgets copied and registered.')
}

function ios() {
  const app = join(root, 'ios/App/App')
  if (!existsSync(app)) return console.log('ios/ not found, skipped (run `npm run add:ios` on a Mac first).')
  cpSync(join(root, 'native/ios/App'), app, { recursive: true })
  // The widget extension's files go into the folder that
  // scripts/setup-ios-project.rb makes when it adds the SharloopWidgets
  // target. Until then they wait.
  const extension = join(root, 'ios/App/SharloopWidgets')
  const extensionReady = existsSync(extension)
  if (extensionReady) cpSync(join(root, 'native/ios/SharloopWidgets'), extension, { recursive: true })

  // Start the app with our view controller, which registers the plugin.
  // Capacitor 8 creates it in SceneDelegate.swift; older templates in the
  // storyboard.
  const sceneDelegate = join(app, 'SceneDelegate.swift')
  if (existsSync(sceneDelegate)) {
    patch(sceneDelegate, 'MainViewController()', (t) => t.replace('= CAPBridgeViewController()', '= MainViewController()'))
  } else {
    patch(join(app, 'Base.lproj/Main.storyboard'), 'customClass="MainViewController"', (t) =>
      t.replace(
        'customClass="CAPBridgeViewController" customModule="Capacitor"',
        'customClass="MainViewController" customModule="App" customModuleProvider="target"',
      ),
    )
  }

  // sharloop:// links (widget taps) open the app.
  patch(join(app, 'Info.plist'), '<string>sharloop</string>', (t) =>
    t.replace(
      /<dict>/,
      `<dict>
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>app.sharloop.widget</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>sharloop</string>
			</array>
		</dict>
	</array>
	<key>WKAppBoundDomains</key>
	<array>
		<string>sharloop.vercel.app</string>
	</array>`,
    ),
  )
  // The app makes no use of non-exempt encryption (only HTTPS and the
  // system's own), so App Store uploads don't stop to ask.
  patch(join(app, 'Info.plist'), 'ITSAppUsesNonExemptEncryption', (t) =>
    t.replace(/<dict>/, `<dict>
	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>`),
  )

  console.log(
    extensionReady
      ? 'iOS: plugin, widget files and URL scheme in place.'
      : 'iOS: plugin and URL scheme in place. Run `ruby scripts/setup-ios-project.rb`, then this script again, to add the widgets.',
  )
}

if (!only || only === 'android') android()
if (!only || only === 'ios') ios()
