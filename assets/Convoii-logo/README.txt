CONVOII — APP LOGO (concept 2c)
================================
Mark: two riders linked in range (you = orange, rider nearby = white) with a live proximity link.
Colours:  orange #FF5A1F · white #FFFFFF · tile bg #141210 -> #070605

FILES
  icon-1024.png / icon-512.png / icon-192.png   Full icon with dark tile (iOS + fallback)
  icon.svg                                       Vector, full tile (glow via SVG filter)
  android-adaptive-foreground.png / .svg         Transparent, mark only, sits in Android safe zone
  (pair the foreground with background colour #070605)

REACT NATIVE — how to drop in
  EXPO (app.json / app.config.js):
    "icon": "./assets/Convoii-logo/icon-1024.png",
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/Convoii-logo/android-adaptive-foreground.png",
        "backgroundColor": "#070605"
      }
    }

  BARE RN:
    iOS  — open ios/<App>/Images.xcassets/AppIcon.appiconset and drop icon-1024.png,
           or run: npx react-native-set-icon --path Convoii-logo/icon-1024.png
    Android — replace mipmap-*/ic_launcher.png (use icon-192.png as xxhdpi baseline)
              and for adaptive icons set res/mipmap-anydpi-v26/ic_launcher.xml to use
              the foreground drawable + a #070605 background colour.

  IN-APP (splash / header) with react-native-svg:
    Use icon.svg via react-native-svg-transformer, or import <Svg> and recreate:
    two <Circle> (orange r86 @408,512 · white r86 @616,512) over a range line — all in the SVG.

Regenerate any size from icon.svg with a vector tool for crisp output.