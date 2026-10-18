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
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.speech.tts.TextToSpeech;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String PREFS = "helix";
    private static final String SERVER_KEY = "server_url";
    private static final String EMULATOR_URL = "http://10.0.2.2:3000";
    private static final String SPACE_URL = "https://smokemoney81-helix.hf.space";
    private static final int BACKGROUND = Color.rgb(11, 16, 32);
    private static final int MINT = Color.rgb(185, 241, 132);

    private LinearLayout root;
    private WebView web;
    private String serverUrl;
    private boolean homeVisible;
    private TextToSpeech tts;
    private boolean ttsReady;
    private HelixVoiceController voiceController;
    private HelixCatalogClient catalogClient;
    private HelixLocalChatClient localChatClient;
    private HelixMediaTools mediaTools;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);
        serverUrl = getPreferences(MODE_PRIVATE).getString(SERVER_KEY, null);
        if (serverUrl == null) serverUrl = isEmulator() ? EMULATOR_URL : SPACE_URL;
        tts = new TextToSpeech(this, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            runOnUiThread(() -> {
                if (homeVisible && web != null) postOfflineGermanVoices();
            });
        });
        voiceController = new HelixVoiceController(this, new HelixVoiceController.Callback() {
            @Override public void onResult(String transcript) {
                runOnUiThread(() -> evaluateVoiceCallback("helixVoiceResult", transcript));
            }
            @Override public void onStatus(String status) {
                runOnUiThread(() -> evaluateVoiceCallback("helixVoiceStatus", status));
            }
        });
        catalogClient = new HelixCatalogClient(this, (requestId, json, error) -> {
            if (!homeVisible || web == null) return;
            String callbackScript = "window.helixCatalogResponse && window.helixCatalogResponse("
                + JSONObject.quote(requestId) + ","
                + JSONObject.quote(json == null ? "" : json) + ","
                + (error == null ? "null" : JSONObject.quote(error)) + ")";
            web.evaluateJavascript(callbackScript, null);
        });
        localChatClient = new HelixLocalChatClient(this, (requestId, answer, error) -> {
            if (!homeVisible || web == null) return;
            String callbackScript = "window.helixLocalChatResult && window.helixLocalChatResult("
                + JSONObject.quote(requestId) + ","
                + JSONObject.quote(answer == null ? "" : answer) + ","
                + (error == null ? "null" : JSONObject.quote(error)) + ")";
            web.evaluateJavascript(callbackScript, null);
        });
        mediaTools = new HelixMediaTools(this, (status, path, success) -> {
            if (!homeVisible || web == null) return;
            String callbackScript = "window.helixMediaResult && window.helixMediaResult("
                + JSONObject.quote(status) + ","
                + (path == null ? "null" : JSONObject.quote(path)) + ","
                + success + ")";
            web.evaluateJavascript(callbackScript, null);
        });
        showHome(false);
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
        if (voiceController != null) voiceController.cancel();
        if (web != null) { web.destroy(); web = null; }
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BACKGROUND);
        setContentView(root);
    }

    private void showSetup(String message) {
        initRoot();
        homeVisible = false;
        web = new WebView(this);
        web.setBackgroundColor(BACKGROUND);
        web.getSettings().setJavaScriptEnabled(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                if (!"helix".equals(target.getScheme())) return true;
                if ("home".equals(target.getHost())) showHome(false);
                else if ("studio".equals(target.getHost())) showStudio();
                else if ("connect".equals(target.getHost())) {
                    String value = target.getQueryParameter("url");
                    if (value == null) return true;
                    value = value.trim().replaceAll("/+$", "");
                    Uri server = Uri.parse(value);
                    boolean secure = "https".equals(server.getScheme()) && server.getHost() != null;
                    boolean emulatorLocal = isEmulator() && EMULATOR_URL.equals(value);
                    if (!secure && !emulatorLocal) {
                        Toast.makeText(MainActivity.this, "Bitte eine gültige HTTPS-Adresse eintragen.", Toast.LENGTH_LONG).show();
                        return true;
                    }
                    serverUrl = value;
                    getPreferences(MODE_PRIVATE).edit().putString(SERVER_KEY, value).apply();
                    showStudio();
                }
                return true;
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(-1, -1));
        web.loadUrl("file:///android_asset/settings.html?url=" + Uri.encode(serverUrl));
    }

    private void showStudio() {
        initRoot();
        homeVisible = false;
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(20), 0, dp(20), 0);
        bar.setBackgroundColor(Color.rgb(16, 25, 43));
        root.addView(bar, new LinearLayout.LayoutParams(-1, dp(56)));
        TextView title = label("‹   HELIX", 17, MINT);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        title.setOnClickListener(v -> showHome(false));
        bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        TextView server = label("⚙  Server", 12, Color.WHITE);
        server.setPadding(dp(12), dp(8), dp(12), dp(8));
        android.graphics.drawable.GradientDrawable serverBackground = new android.graphics.drawable.GradientDrawable();
        serverBackground.setColor(Color.rgb(35, 52, 73));
        serverBackground.setCornerRadius(dp(12));
        server.setBackground(serverBackground);
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
                if (request.isForMainFrame()) showHome(true);
            }

            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400)
                    showHome(true);
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

    private void showHome(boolean serverUnavailable) {
        initRoot();
        homeVisible = true;
        web = new WebView(this);
        web.setBackgroundColor(BACKGROUND);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                if (homeVisible && url != null && url.startsWith("file:///android_asset/home.html")) postOfflineGermanVoices();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                if ("baitbuddy".equals(target.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, target)); }
                    catch (Exception ignored) { Toast.makeText(MainActivity.this, "BaitBuddy konnte nicht geöffnet werden. Endpoint manuell eintragen.", Toast.LENGTH_LONG).show(); }
                    return true;
                }
                if ("helix".equals(target.getScheme())) {
                    if ("studio".equals(target.getHost())) showStudio();
                    else if ("settings".equals(target.getHost())) showSetup(null);
                    else if ("open-termux".equals(target.getHost())) {
                        try { Intent termux = new Intent(Intent.ACTION_VIEW, Uri.parse("termux://home")); termux.setPackage("com.termux"); startActivity(termux); }
                        catch (Exception ignored) { Toast.makeText(MainActivity.this, "Termux ist nicht installiert.", Toast.LENGTH_LONG).show(); }
                    } else if ("pick-photo".equals(target.getHost()) || "pick-video".equals(target.getHost())) {
                        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT); picker.addCategory(Intent.CATEGORY_OPENABLE); picker.setType("pick-photo".equals(target.getHost()) ? "image/*" : "video/*"); startActivityForResult(picker, "pick-photo".equals(target.getHost()) ? 43 : 41);
                    } else if ("pick-model".equals(target.getHost())) {
                        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT); picker.addCategory(Intent.CATEGORY_OPENABLE); picker.setType("application/octet-stream"); startActivityForResult(picker, 42);
                    } else if ("pick-gallery".equals(target.getHost())) {
                        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT); picker.addCategory(Intent.CATEGORY_OPENABLE); picker.setType("*/*"); picker.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"}); startActivityForResult(picker, 44);
                    } else if ("pick-av-video".equals(target.getHost()) || "pick-av-audio".equals(target.getHost())) {
                        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT); picker.addCategory(Intent.CATEGORY_OPENABLE); picker.setType("pick-av-video".equals(target.getHost()) ? "video/*" : "audio/*"); startActivityForResult(picker, "pick-av-video".equals(target.getHost()) ? 46 : 47);
                    } else if ("tools-video".equals(target.getHost()) || "tools-audio".equals(target.getHost())) {
                        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                        picker.addCategory(Intent.CATEGORY_OPENABLE);
                        picker.setType("tools-video".equals(target.getHost()) ? "video/*" : "audio/*");
                        picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                        startActivityForResult(picker, "tools-video".equals(target.getHost()) ? 146 : 147);
                    } else if ("tools-record".equals(target.getHost())) {
                        if (mediaTools != null) {
                            if (mediaTools.isRecording()) mediaTools.stopRecording();
                            else if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED)
                                mediaTools.startRecording();
                            else requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 72);
                        }
                    } else if ("tools-merge".equals(target.getHost())) {
                        if (mediaTools != null) mediaTools.merge();
                    } else if ("save-video".equals(target.getHost())) Toast.makeText(MainActivity.this, "Lokales Video kann nach der Auswahl gespeichert werden.", Toast.LENGTH_LONG).show();
                    else if ("catalog".equals(target.getHost())) {
                        if (catalogClient != null) catalogClient.search(
                            target.getQueryParameter("tag"),
                            target.getQueryParameter("offset"),
                            target.getQueryParameter("request"));
                    } else if ("local-chat".equals(target.getHost())) {
                        if (localChatClient != null) localChatClient.send(
                            target.getQueryParameter("request"),
                            target.getQueryParameter("messages"));
                    } else if ("model-info".equals(target.getHost())) {
                        if (localChatClient != null) localChatClient.getActiveModel((id, error) -> {
                            if (!homeVisible || web == null) return;
                            String script = "window.helixLocalModelInfo && window.helixLocalModelInfo("
                                + (id == null ? "null" : JSONObject.quote(id)) + ","
                                + (error == null ? "null" : JSONObject.quote(error)) + ")";
                            web.evaluateJavascript(script, null);
                        });
                    } else if ("open-chatgpt".equals(target.getHost())) {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://chatgpt.com/")));
                        } catch (Exception ignored) {
                            Toast.makeText(MainActivity.this, "ChatGPT konnte nicht geöffnet werden.", Toast.LENGTH_LONG).show();
                        }
                    } else if ("voice-listen".equals(target.getHost())) {
                        if (voiceController != null) voiceController.start();
                    } else if ("voice-list".equals(target.getHost())) {
                        postOfflineGermanVoices();
                    } else if ("voice-select".equals(target.getHost())) {
                        String name = target.getQueryParameter("name");
                        if (findGermanOfflineVoice(name) != null) {
                            getPreferences(MODE_PRIVATE).edit().putString("german_offline_voice", name).apply();
                            postOfflineGermanVoices();
                        }
                    } else if ("voice-preview".equals(target.getHost())) {
                        String name = target.getQueryParameter("name");
                        if (findGermanOfflineVoice(name) != null) {
                            getPreferences(MODE_PRIVATE).edit().putString("german_offline_voice", name).apply();
                            speakOfflineGerman("Hallo, ich bin deine lokale deutsche Stimme für Helix.");
                        }
                    } else if ("speak".equals(target.getHost())) {
                        speakOfflineGerman(target.getQueryParameter("text"));
                    }
                    return true;
                }
                if ("https".equals(target.getScheme()) && "huggingface.co".equalsIgnoreCase(target.getHost())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, target)); }
                    catch (Exception ignored) { Toast.makeText(MainActivity.this, "Link konnte nicht geöffnet werden.", Toast.LENGTH_LONG).show(); }
                }
                return true;
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(-1, -1));
        web.loadUrl("file:///android_asset/home.html" + (serverUnavailable ? "?offline=1" : ""));
    }


    private void evaluateVoiceCallback(String method, String value) {
        if (!homeVisible || web == null || !("helixVoiceResult".equals(method) || "helixVoiceStatus".equals(method))) return;
        web.evaluateJavascript("window." + method + " && window." + method + "(" + JSONObject.quote(value) + ")", null);
    }

    /** Never select a voice requiring network access, even if the system TTS default is online. */
    private android.speech.tts.Voice findGermanOfflineVoice(String selectedName) {
        if (!ttsReady || tts == null || tts.getVoices() == null) return null;
        android.speech.tts.Voice first = null;
        for (android.speech.tts.Voice candidate : tts.getVoices()) {
            if (candidate == null || candidate.getLocale() == null || candidate.isNetworkConnectionRequired()) continue;
            if (!Locale.GERMAN.getLanguage().equals(candidate.getLocale().getLanguage())) continue;
            if (selectedName != null && selectedName.equals(candidate.getName())) return candidate;
            if (first == null || (Locale.GERMANY.equals(candidate.getLocale()) && !Locale.GERMANY.equals(first.getLocale())))
                first = candidate;
        }
        return selectedName == null ? first : null;
    }

    private void postOfflineGermanVoices() {
        JSONArray voices = new JSONArray();
        String selected = getPreferences(MODE_PRIVATE).getString("german_offline_voice", null);
        if (ttsReady && tts != null && tts.getVoices() != null) {
            for (android.speech.tts.Voice voice : tts.getVoices()) {
                if (voice == null || voice.getLocale() == null || voice.isNetworkConnectionRequired()) continue;
                if (!Locale.GERMAN.getLanguage().equals(voice.getLocale().getLanguage())) continue;
                JSONObject item = new JSONObject();
                try {
                    item.put("name", voice.getName());
                    item.put("language", voice.getLocale().toLanguageTag());
                    voices.put(item);
                } catch (Exception ignored) { }
            }
        }
        if (homeVisible && web != null) {
            String script = "window.helixVoiceChoices && window.helixVoiceChoices("
                + voices.toString() + "," + JSONObject.quote(selected == null ? "" : selected) + ")";
            web.evaluateJavascript(script, null);
        }
    }

    private void speakOfflineGerman(String text) {
        if (text == null || text.trim().isEmpty()) return;
        if (text.length() > TextToSpeech.getMaxSpeechInputLength()) {
            Toast.makeText(this, "Text zu lang für die lokale Sprachausgabe.", Toast.LENGTH_LONG).show();
            return;
        }
        if (!ttsReady || tts == null) {
            Toast.makeText(this, "Lokale Sprachausgabe ist noch nicht bereit.", Toast.LENGTH_LONG).show();
            return;
        }
        String preferred = getPreferences(MODE_PRIVATE).getString("german_offline_voice", null);
        android.speech.tts.Voice voice = findGermanOfflineVoice(preferred);
        if (voice == null) voice = findGermanOfflineVoice(null);
        if (voice == null) {
            Toast.makeText(this, "Keine lokale deutsche Stimme installiert. Sprachdaten in Android installieren.", Toast.LENGTH_LONG).show();
            return;
        }
        if (tts.setVoice(voice) != TextToSpeech.SUCCESS) {
            Toast.makeText(this, "Lokale Stimme kann nicht aktiviert werden.", Toast.LENGTH_LONG).show();
            return;
        }
        if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "helix-local") == TextToSpeech.ERROR) {
            Toast.makeText(this, "Lokale Sprachausgabe fehlgeschlagen.", Toast.LENGTH_LONG).show();
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (voiceController != null) voiceController.onRequestPermissionsResult(requestCode, grantResults);
        if (requestCode == 72 && mediaTools != null && grantResults.length > 0
                && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            mediaTools.startRecording();
        }
    }

    @Override protected void onPause() {
        if (voiceController != null) voiceController.cancel();
        super.onPause();
    }

    @Override public void onBackPressed() {
        if (homeVisible) super.onBackPressed();
        else if (web != null && web.canGoBack()) web.goBack();
        else showHome(false);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null || web == null) return;
        Uri uri = data.getData();
        // Keep access to selected gallery media after the activity or app restarts.
        try {
            if ((data.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0) {
                getContentResolver().takePersistableUriPermission(
                    uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
        } catch (SecurityException ignored) {
            // Providers without persistable grants are usable for the current session.
        }
        if (requestCode == 146 || requestCode == 147) {
            if (mediaTools != null) {
                if (requestCode == 146) mediaTools.setVideo(uri);
                else mediaTools.setAudio(uri);
            }
            return;
        }
        String name = uri.getLastPathSegment() == null ? "Datei ausgewählt" : uri.getLastPathSegment();
        // Never interpolate document-provider names or URIs into executable JavaScript.
        if (requestCode == 42) {
            String script = "(function(){const select=document.getElementById('local-model');"
                + "if(!select)return;const option=document.createElement('option');"
                + "option.textContent=" + JSONObject.quote(name)
                + ";select.replaceChildren(option);})()";
            web.evaluateJavascript(script, null);
            return;
        }
        if (requestCode != 41 && requestCode != 43 && requestCode != 44
                && requestCode != 46 && requestCode != 47) return;
        String mimeType = getContentResolver().getType(uri);
        String mediaType = requestCode == 43
                || (requestCode == 44 && mimeType != null && mimeType.startsWith("image/"))
                ? "image/*" : requestCode == 47 ? "audio/*" : "video/*";
        String script = "window.showPickedMedia && window.showPickedMedia("
                + JSONObject.quote(uri.toString()) + ","
                + JSONObject.quote(name) + ","
                + JSONObject.quote(mediaType) + ")";
        web.evaluateJavascript(script, null);
    }

    @Override protected void onDestroy() {
        if (mediaTools != null) mediaTools.destroy();
        if (localChatClient != null) localChatClient.destroy();
        if (catalogClient != null) catalogClient.destroy();
        if (voiceController != null) voiceController.destroy();
        if (web != null) web.destroy();
        if (tts != null) { tts.stop(); tts.shutdown(); }
        super.onDestroy();
    }
}
