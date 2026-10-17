# Helix Android APK

This is the Android app for Helix. Its built-in home screen has Video and Voice filters and a selection of four public Hugging Face models. Selecting a model shows its details and opens the model Space in the browser. This works even when the Helix server is offline. The Settings screen stores an optional server URL; the connected Studio supports in-app generation and downloads.

The default server URL is `https://smokemoney81-helix.hf.space` on a physical device and `http://10.0.2.2:3000` on an Android emulator. The APK does not run the Python backend. If the Studio is offline, Helix returns to its built-in home screen with an explanation.

GitHub Actions builds the APK on pushes to `main` that change `android/`. Open the **Build Helix APK** workflow and download the **helix-debug-apk** artifact. You can also run the workflow manually.

To build locally, run `./gradlew :app:assembleDebug` in this directory. The installable, debug-signed APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

These GitHub Actions APKs use ephemeral debug signing keys. Android cannot upgrade an APK signed by a different key. If installation reports a signature conflict, uninstall the previous Helix APK and install the new one. A stable, private release-signing key is needed for seamless future upgrades.
