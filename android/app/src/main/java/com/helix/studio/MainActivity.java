package com.helix.studio;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String PREFS = "helix";
    private static final String SERVER_KEY = "server_url";
    private static final String EMULATOR_URL = "http://10.0.2.2:3000";
    private static final String SPACE_URL = "https://smokemoney81-helix.hf.space";
    private static final int BACKGROUND = Color.rgb(16, 18, 18);
    private static final int MINT = Color.rgb(185, 237, 128);

    private LinearLayout root;
    private WebView web;
    private String serverUrl;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);
        serverUrl = getPreferences(MODE_PRIVATE).getString(SERVER_KEY, null);
        if (serverUrl == null) serverUrl = isEmulator() ? EMULATOR_URL : SPACE_URL;
        showStudio();
    }

    private boolean isEmulator() {
        return Build.FINGERPRINT.contains("generic") || Build.MODEL.contains("Emulator") || Build.MODEL.contains("sdk_gphone");
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private TextView label(String text, int size, int color) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private void initRoot() {
        if (web != null) { web.destroy(); web = null; }
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BACKGROUND);
        setContentView(root);
    }

    private void showSetup(String message) {
        initRoot();
        ScrollView scroll = new ScrollView(this);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, -1));
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(28), dp(50), dp(28), dp(20));
        scroll.addView(panel);

        TextView title = label("Helix ✳", 32, MINT);
        panel.addView(title);
        TextView subtitle = label("Verbinde dein Studio", 18, Color.WHITE);
        subtitle.setPadding(0, dp(28), 0, dp(10));
        panel.addView(subtitle);
        TextView hint = label("Trage die HTTPS-Adresse deines laufenden Helix-Servers ein. Danach kannst du Videos und Stimmen erstellen.", 14, Color.rgb(169, 179, 167));
        panel.addView(hint);
        if (message != null) {
            TextView error = label(message, 13, Color.rgb(255, 183, 155));
            error.setPadding(0, dp(18), 0, 0);
            panel.addView(error);
        }

        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setTextColor(Color.WHITE);
        input.setHintTextColor(Color.rgb(130, 140, 130));
        input.setHint("https://dein-helix-server.example");
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        if (serverUrl != null) input.setText(serverUrl);
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(-1, dp(56));
        inputParams.topMargin = dp(25);
        panel.addView(input, inputParams);

        Button connect = new Button(this);
        connect.setText("Studio öffnen");
        connect.setTextColor(Color.rgb(20, 33, 16));
        connect.setBackgroundTintList(android.content.res.ColorStateList.valueOf(MINT));
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(-1, dp(52));
        buttonParams.topMargin = dp(18);
        panel.addView(connect, buttonParams);
        connect.setOnClickListener(v -> {
            String value = input.getText().toString().trim().replaceAll("/+$", "");
            Uri uri = Uri.parse(value);
            boolean secure = "https".equals(uri.getScheme()) && uri.getHost() != null;
            boolean emulatorLocal = isEmulator() && EMULATOR_URL.equals(value);
            if (!secure && !emulatorLocal) {
                input.setError("Bitte eine gültige HTTPS-Adresse eintragen.");
                return;
            }
            serverUrl = value;
            getPreferences(MODE_PRIVATE).edit().putString(SERVER_KEY, value).apply();
            showStudio();
        });

        TextView models = label("Modelle direkt auf Hugging Face öffnen", 18, Color.WHITE);
        models.setPadding(0, dp(34), 0, dp(8));
        panel.addView(models);
        TextView modelHint = label("Bis dein Helix-Server läuft, kannst du diese öffentlichen Modelle direkt nutzen. Warteschlangen oder eine Anmeldung sind möglich.", 14, Color.rgb(169, 179, 167));
        panel.addView(modelHint);
        addModelLink(panel, "Video · LTX-Video", "https://huggingface.co/spaces/Lightricks/ltx-video-distilled");
        addModelLink(panel, "Stimme · Qwen3-TTS (Deutsch)", "https://huggingface.co/spaces/Qwen/Qwen3-TTS");
        addModelLink(panel, "Stimme · KittenTTS (Englisch)", "https://huggingface.co/spaces/KittenML/KittenTTS-Demo");
    }

    private void addModelLink(LinearLayout panel, String title, String url) {
        Button button = new Button(this);
        button.setText(title);
        button.setAllCaps(false);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(52));
        params.topMargin = dp(10);
        panel.addView(button, params);
        button.setOnClickListener(v -> {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
            catch (Exception ignored) { Toast.makeText(this, "Link konnte nicht geöffnet werden.", Toast.LENGTH_LONG).show(); }
        });
    }

    private void showStudio() {
        initRoot();
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(15), 0, dp(10), 0);
        root.addView(bar, new LinearLayout.LayoutParams(-1, dp(48)));
        TextView title = label("✳  Helix", 19, MINT);
        bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Button server = new Button(this);
        server.setText("Server");
        server.setTextSize(11);
        server.setOnClickListener(v -> showSetup(null));
        bar.addView(server);

        web = new WebView(this);
        web.setBackgroundColor(BACKGROUND);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                Uri origin = Uri.parse(serverUrl);
                if (origin.getHost().equalsIgnoreCase(target.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, target)); }
                catch (Exception ignored) { Toast.makeText(MainActivity.this, "Link konnte nicht geöffnet werden.", Toast.LENGTH_LONG).show(); }
                return true;
            }

            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showSetup("Server nicht erreichbar. Prüfe die Adresse und die Verbindung.");
            }

            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400)
                    showSetup("Server antwortet nicht. Versuche es in Kürze erneut.");
            }
        });
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            Uri target = Uri.parse(url);
            Uri origin = Uri.parse(serverUrl);
            if (!origin.getHost().equalsIgnoreCase(target.getHost())) {
                Toast.makeText(this, "Download-Quelle nicht erlaubt.", Toast.LENGTH_LONG).show();
                return;
            }
            try {
                String extension = mimeType != null && mimeType.startsWith("audio/") ? ".wav" : ".mp4";
                String filename = "helix-" + System.currentTimeMillis() + extension;
                DownloadManager.Request request = new DownloadManager.Request(target);
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) request.addRequestHeader("Cookie", cookies);
                request.setMimeType(mimeType);
                request.setTitle(filename);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, filename);
                ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(request);
                Toast.makeText(this, "Download gestartet", Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                Toast.makeText(this, "Download fehlgeschlagen", Toast.LENGTH_LONG).show();
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        web.loadUrl(serverUrl);
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
