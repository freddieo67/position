const fs = require('fs');
const path = require('path');
const {
  withXcodeProject,
  withDangerousMod,
  withAndroidManifest,
} = require('@expo/config-plugins');

const WIDGET_NAME = 'PositionWidget';
const WIDGET_BUNDLE_ID = 'com.xspecio.position.widget';

const IOS_WIDGET_SWIFT = `import WidgetKit
import SwiftUI

struct PositionEntry: TimelineEntry {
    let date: Date
}

struct PositionProvider: TimelineProvider {
    func placeholder(in context: Context) -> PositionEntry {
        PositionEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (PositionEntry) -> Void) {
        completion(PositionEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PositionEntry>) -> Void) {
        let entry = PositionEntry(date: Date())
        let timeline = Timeline(entries: [entry], policy: .never)
        completion(timeline)
    }
}

struct ActionCircleButton: View {
    let title: String
    let actionPath: String

    private let tealColor = Color(red: 15.0 / 255.0, green: 76.0 / 255.0, blue: 92.0 / 255.0)

    var body: some View {
        if let url = URL(string: "position://action/\\(actionPath)") {
            Link(destination: url) {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.95))
                        .overlay(
                            Circle()
                                .stroke(tealColor, lineWidth: 2.2)
                        )
                        .shadow(color: Color.black.opacity(0.14), radius: 3, x: 0, y: 2)

                    Text(title)
                        .font(.system(size: 11.5, weight: .bold))
                        .foregroundColor(tealColor)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.75)
                        .padding(6)
                }
                .frame(width: 66, height: 66)
            }
        }
    }
}

struct PositionWidgetEntryView: View {
    var entry: PositionProvider.Entry

    var body: some View {
        HStack(spacing: 12) {
            ActionCircleButton(title: "BEGÄR", actionPath: "request")
            ActionCircleButton(title: "PHING", actionPath: "ping")
            ActionCircleButton(title: "FLASH\\nMESS", actionPath: "flash")
            ActionCircleButton(title: "DELA", actionPath: "send")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetBackground()
    }
}

extension View {
    @ViewBuilder
    func widgetBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.containerBackground(for: .widget) {
                Color(red: 245.0 / 255.0, green: 248.0 / 255.0, blue: 250.0 / 255.0)
            }
        } else {
            self.background(Color(red: 245.0 / 255.0, green: 248.0 / 255.0, blue: 250.0 / 255.0))
        }
    }
}

@main
struct PositionWidget: Widget {
    let kind: String = "PositionWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PositionProvider()) { entry in
            PositionWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Position Snabbval")
        .description("Snabbknappar för Begär, Phing, Flash-mess och Dela.")
        .supportedFamilies([.systemMedium])
    }
}
`;

const IOS_WIDGET_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Position</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
  </dict>
</dict>
</plist>
`;

const ANDROID_PROVIDER_KT = `package com.xspecio.position

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class PositionWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    for (appWidgetId in appWidgetIds) {
      updateAppWidget(context, appWidgetManager, appWidgetId)
    }
  }

  companion object {
    private fun createActionPendingIntent(context: Context, action: String, requestCode: Int): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("position://action/$action")).apply {
        setPackage(context.packageName)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      }
      return PendingIntent.getActivity(
        context,
        requestCode,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    fun updateAppWidget(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetId: Int
    ) {
      val views = RemoteViews(context.packageName, R.layout.position_widget)
      views.setOnClickPendingIntent(R.id.widget_btn_request, createActionPendingIntent(context, "request", 101))
      views.setOnClickPendingIntent(R.id.widget_btn_ping, createActionPendingIntent(context, "ping", 102))
      views.setOnClickPendingIntent(R.id.widget_btn_flash, createActionPendingIntent(context, "flash", 103))
      views.setOnClickPendingIntent(R.id.widget_btn_send, createActionPendingIntent(context, "send", 104))
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }
}
`;

const ANDROID_DRAWABLE_CIRCLE = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="oval">
    <solid android:color="#F2FFFFFF" />
    <stroke
        android:width="2dp"
        android:color="#0F4C5C" />
    <size
        android:width="68dp"
        android:height="68dp" />
</shape>
`;

const ANDROID_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="horizontal"
    android:gravity="center"
    android:padding="4dp">

    <FrameLayout
        android:layout_width="0dp"
        android:layout_height="match_parent"
        android:layout_weight="1"
        android:gravity="center">
        <TextView
            android:id="@+id/widget_btn_request"
            android:layout_width="68dp"
            android:layout_height="68dp"
            android:layout_gravity="center"
            android:background="@drawable/widget_circle_btn"
            android:gravity="center"
            android:text="BEGÄR"
            android:textColor="#0F4C5C"
            android:textSize="11sp"
            android:textStyle="bold"
            android:maxLines="1" />
    </FrameLayout>

    <FrameLayout
        android:layout_width="0dp"
        android:layout_height="match_parent"
        android:layout_weight="1"
        android:gravity="center">
        <TextView
            android:id="@+id/widget_btn_ping"
            android:layout_width="68dp"
            android:layout_height="68dp"
            android:layout_gravity="center"
            android:background="@drawable/widget_circle_btn"
            android:gravity="center"
            android:text="PHING"
            android:textColor="#0F4C5C"
            android:textSize="11sp"
            android:textStyle="bold"
            android:maxLines="1" />
    </FrameLayout>

    <FrameLayout
        android:layout_width="0dp"
        android:layout_height="match_parent"
        android:layout_weight="1"
        android:gravity="center">
        <TextView
            android:id="@+id/widget_btn_flash"
            android:layout_width="68dp"
            android:layout_height="68dp"
            android:layout_gravity="center"
            android:background="@drawable/widget_circle_btn"
            android:gravity="center"
            android:text="FLASH&#10;MESS"
            android:textColor="#0F4C5C"
            android:textSize="10.5sp"
            android:textStyle="bold"
            android:maxLines="2" />
    </FrameLayout>

    <FrameLayout
        android:layout_width="0dp"
        android:layout_height="match_parent"
        android:layout_weight="1"
        android:gravity="center">
        <TextView
            android:id="@+id/widget_btn_send"
            android:layout_width="68dp"
            android:layout_height="68dp"
            android:layout_gravity="center"
            android:background="@drawable/widget_circle_btn"
            android:gravity="center"
            android:text="DELA"
            android:textColor="#0F4C5C"
            android:textSize="11sp"
            android:textStyle="bold"
            android:maxLines="1" />
    </FrameLayout>

</LinearLayout>
`;

const ANDROID_WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="60dp"
    android:targetCellWidth="4"
    android:targetCellHeight="1"
    android:updatePeriodMillis="0"
    android:initialLayout="@layout/position_widget"
    android:resizeMode="horizontal"
    android:widgetCategory="home_screen" />
`;

function withIosWidget(config) {
  config = withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const iosRoot = modConfig.modRequest.platformProjectRoot;
      const widgetDestDir = path.join(iosRoot, WIDGET_NAME);

      if (!fs.existsSync(widgetDestDir)) {
        fs.mkdirSync(widgetDestDir, { recursive: true });
      }

      fs.writeFileSync(path.join(widgetDestDir, 'PositionWidget.swift'), IOS_WIDGET_SWIFT, 'utf8');
      fs.writeFileSync(path.join(widgetDestDir, 'PositionWidget-Info.plist'), IOS_WIDGET_PLIST, 'utf8');

      return modConfig;
    },
  ]);

  config = withXcodeProject(config, (modConfig) => {
    const xcodeProject = modConfig.modResults;

    if (xcodeProject.pbxTargetByName(WIDGET_NAME)) {
      return modConfig;
    }

    const appVersion = modConfig.version || '1.0.0';
    const buildNumber = (modConfig.ios && modConfig.ios.buildNumber) || '1';

    const target = xcodeProject.addTarget(
      WIDGET_NAME,
      'app_extension',
      WIDGET_NAME,
      WIDGET_BUNDLE_ID
    );

    const group = xcodeProject.addPbxGroup(
      ['PositionWidget.swift', 'PositionWidget-Info.plist'],
      WIDGET_NAME,
      WIDGET_NAME
    );

    const mainGroupId = xcodeProject.getFirstProject().firstProject.mainGroup;
    xcodeProject.addToPbxGroup(group.uuid, mainGroupId);

    xcodeProject.addBuildPhase(
      ['PositionWidget.swift'],
      'PBXSourcesBuildPhase',
      'Sources',
      target.uuid
    );

    xcodeProject.addBuildPhase(
      [],
      'PBXFrameworksBuildPhase',
      'Frameworks',
      target.uuid
    );

    xcodeProject.addFramework('WidgetKit.framework', {
      target: target.uuid,
      link: true,
    });
    xcodeProject.addFramework('SwiftUI.framework', {
      target: target.uuid,
      link: true,
    });

    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const buildConfig = configurations[key];
      if (
        buildConfig &&
        buildConfig.buildSettings &&
        buildConfig.buildSettings.PRODUCT_NAME === `"${WIDGET_NAME}"`
      ) {
        buildConfig.buildSettings.CLANG_ENABLE_MODULES = 'YES';
        buildConfig.buildSettings.SWIFT_VERSION = '5.0';
        buildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.0';
        buildConfig.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
        buildConfig.buildSettings.MARKETING_VERSION = appVersion;
        buildConfig.buildSettings.CURRENT_PROJECT_VERSION = buildNumber;
        buildConfig.buildSettings.GENERATE_INFOPLIST_FILE = 'NO';
        buildConfig.buildSettings.INFOPLIST_FILE = `"${WIDGET_NAME}/${WIDGET_NAME}-Info.plist"`;
        buildConfig.buildSettings.CODE_SIGN_STYLE = 'Automatic';
      }
    }

    return modConfig;
  });

  return config;
}

function withAndroidWidget(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const app = modConfig.modResults.manifest.application?.[0];
    if (app) {
      app.receiver = app.receiver || [];
      const exists = app.receiver.some(
        (r) => r.$?.['android:name'] === '.PositionWidgetProvider'
      );
      if (!exists) {
        app.receiver.push({
          $: {
            'android:name': '.PositionWidgetProvider',
            'android:exported': 'true',
            'android:label': '@string/app_name',
          },
          'intent-filter': [
            {
              action: [
                {
                  $: {
                    'android:name': 'android.appwidget.action.APPWIDGET_UPDATE',
                  },
                },
              ],
            },
          ],
          'meta-data': [
            {
              $: {
                'android:name': 'android.appwidget.provider',
                'android:resource': '@xml/position_widget_info',
              },
            },
          ],
        });
      }
    }
    return modConfig;
  });

  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const androidRoot = modConfig.modRequest.platformProjectRoot;
      const mainDir = path.join(androidRoot, 'app', 'src', 'main');
      const pkgDir = path.join(mainDir, 'java', 'com', 'xspecio', 'position');
      const drawableDir = path.join(mainDir, 'res', 'drawable');
      const layoutDir = path.join(mainDir, 'res', 'layout');
      const xmlDir = path.join(mainDir, 'res', 'xml');

      for (const d of [pkgDir, drawableDir, layoutDir, xmlDir]) {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      }

      fs.writeFileSync(path.join(pkgDir, 'PositionWidgetProvider.kt'), ANDROID_PROVIDER_KT, 'utf8');
      fs.writeFileSync(path.join(drawableDir, 'widget_circle_btn.xml'), ANDROID_DRAWABLE_CIRCLE, 'utf8');
      fs.writeFileSync(path.join(layoutDir, 'position_widget.xml'), ANDROID_LAYOUT_XML, 'utf8');
      fs.writeFileSync(path.join(xmlDir, 'position_widget_info.xml'), ANDROID_WIDGET_INFO_XML, 'utf8');

      return modConfig;
    },
  ]);

  return config;
}

module.exports = function withPositionWidget(config) {
  config = withIosWidget(config);
  config = withAndroidWidget(config);
  return config;
};
