# Helix Android APK

This is the native Android shell for Helix. It opens the web studio and sends generation requests to its FastAPI server.

On a physical device, Helix asks for your running studio server's HTTPS address at first launch. You can change it later with the **Server** button. The APK alone does not run the Python backend. On an Android emulator, Helix opens `http://10.0.2.2:3000` by default, which reaches the host computer's port 3000.

GitHub Actions builds the APK on pushes to `main` that change `android/`. Open the **Build Helix APK** workflow and download the **helix-debug-apk** artifact. You can also run the workflow manually.

To build locally, run `./gradlew :app:assembleDebug` in this directory. The installable, debug-signed APK is written to `app/build/outputs/apk/debug/app-debug.apk`.
