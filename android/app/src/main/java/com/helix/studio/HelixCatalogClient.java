package com.helix.studio;

import android.app.Activity;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Read-only public model discovery with a hardcoded HTTPS destination.
 * Never accepts a user URL, secret, prompt, or arbitrary network endpoint.
 */
final class HelixCatalogClient {
    interface Callback {
        void onCatalog(String requestId, String json, String error);
    }

    private static final int MAX_BYTES = 2_500_000;
    private final Activity activity;
    private final Callback callback;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    HelixCatalogClient(Activity activity, Callback callback) {
        this.activity = activity;
        this.callback = callback;
    }

    void search(String tag, String offsetText, String requestId) {
        if (!("text-to-video".equals(tag) || "image-to-video".equals(tag) ||
              "text-to-image".equals(tag) || "text-to-audio".equals(tag))) {
            deliver(requestId, null, "Modellkategorie nicht erlaubt.");
            return;
        }
        if (requestId == null || !requestId.matches("catalog_[0-9]{1,10}")) return;
        int offset;
        try {
            offset = Integer.parseInt(offsetText);
        } catch (Exception error) {
            deliver(requestId, null, "Ungültige Suchposition.");
            return;
        }
        if (offset < 0 || offset > 5000 || offset % 25 != 0) {
            deliver(requestId, null, "Suchposition außerhalb des erlaubten Bereichs.");
            return;
        }
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                String endpoint = "https://huggingface.co/api/models?pipeline_tag=" + tag
                    + "&sort=createdAt&direction=-1&limit=25&offset=" + offset;
                connection = (HttpURLConnection) new URL(endpoint).openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(12000);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("User-Agent", "Helix-Android/1.2");
                int code = connection.getResponseCode();
                if (code != HttpURLConnection.HTTP_OK) {
                    deliver(requestId, null, "Modellsuche HTTP " + code);
                    return;
                }
                try (InputStream input = connection.getInputStream();
                     ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        if (output.size() + read > MAX_BYTES) {
                            deliver(requestId, null, "Modellantwort zu groß.");
                            return;
                        }
                        output.write(buffer, 0, read);
                    }
                    String json = new String(output.toByteArray(), StandardCharsets.UTF_8);
                    if (!json.trim().startsWith("[")) {
                        deliver(requestId, null, "Ungültige Antwort von Hugging Face.");
                        return;
                    }
                    deliver(requestId, json, null);
                }
            } catch (Exception error) {
                deliver(requestId, null, "Modellsuche nicht erreichbar. Internetverbindung prüfen.");
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void deliver(String requestId, String json, String error) {
        if (requestId == null) return;
        activity.runOnUiThread(() -> callback.onCatalog(requestId, json, error));
    }

    void destroy() {
        executor.shutdownNow();
    }
}
