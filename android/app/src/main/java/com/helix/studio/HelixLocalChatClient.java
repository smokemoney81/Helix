package com.helix.studio;

import android.app.Activity;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * User-initiated, local-only chat with llama.cpp's OpenAI-compatible Termux server.
 *
 * All requests go to the literal loopback IP 127.0.0.1:8080.
 * No API key, remote host, paid provider, redirect or automatic cloud fallback.
 */
final class HelixLocalChatClient {
    interface Callback {
        void onResult(String requestId, String answer, String error);
    }

    private static final String LOOPBACK = "http://127.0.0.1:8080";
    private static final int MAX_INPUT_CHARS = 2200;
    private static final int MAX_HISTORY_CHARS = 9000;
    private static final int MAX_RESPONSE_BYTES = 180000;
    private final Activity activity;
    private final Callback callback;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    HelixLocalChatClient(Activity activity, Callback callback) {
        this.activity = activity;
        this.callback = callback;
    }

    void send(String requestId, String messagesJson) {
        if (requestId == null || !requestId.matches("local_[0-9]{1,10}")) return;
        if (messagesJson == null || messagesJson.length() > MAX_HISTORY_CHARS) {
            deliver(requestId, null, "Nachricht zu lang. Bitte kürzer formulieren.");
            return;
        }
        final JSONArray messages;
        try {
            JSONArray input = new JSONArray(messagesJson);
            if (input.length() < 1 || input.length() > 8) throw new IllegalArgumentException();
            messages = new JSONArray();
            int total = 0;
            for (int i = 0; i < input.length(); i++) {
                JSONObject item = input.getJSONObject(i);
                String role = item.getString("role");
                String content = item.getString("content");
                if (!("user".equals(role) || "assistant".equals(role)) ||
                    content.trim().isEmpty() || content.length() > MAX_INPUT_CHARS) {
                    throw new IllegalArgumentException();
                }
                total += content.length();
                if (total > MAX_HISTORY_CHARS) throw new IllegalArgumentException();
                JSONObject safe = new JSONObject();
                safe.put("role", role);
                safe.put("content", content);
                messages.put(safe);
            }
            if (!"user".equals(messages.getJSONObject(messages.length() - 1).getString("role"))) {
                throw new IllegalArgumentException();
            }
        } catch (Exception invalid) {
            deliver(requestId, null, "Ungültiger Chatverlauf.");
            return;
        }
        executor.execute(() -> requestLocalServer(requestId, messages));
    }

    private void requestLocalServer(String requestId, JSONArray messages) {
        HttpURLConnection connection = null;
        try {
            // GET /v1/models to discover the exact GGUF identifier from llama-server.
            String modelId = "local";
            HttpURLConnection models = null;
            try {
                models = (HttpURLConnection) new URL(LOOPBACK + "/v1/models").openConnection();
                models.setInstanceFollowRedirects(false);
                models.setConnectTimeout(2000);
                models.setReadTimeout(3000);
                models.setRequestProperty("Accept", "application/json");
                if (models.getResponseCode() == HttpURLConnection.HTTP_OK) {
                    JSONObject listing = new JSONObject(readLimited(models.getInputStream()));
                    JSONArray items = listing.optJSONArray("data");
                    if (items != null && items.length() > 0) {
                        String discovered = items.getJSONObject(0).optString("id", "");
                        if (!discovered.trim().isEmpty() && discovered.length() <= 160) modelId = discovered;
                    }
                }
            } finally {
                if (models != null) models.disconnect();
            }

            JSONObject requestBody = new JSONObject();
            requestBody.put("model", modelId);
            requestBody.put("messages", messages);
            requestBody.put("stream", false);
            requestBody.put("temperature", 0.7);
            requestBody.put("max_tokens", 350);
            byte[] payload = requestBody.toString().getBytes(StandardCharsets.UTF_8);
            if (payload.length > 16000) {
                deliver(requestId, null, "Chatverlauf zu groß.");
                return;
            }
            connection = (HttpURLConnection) new URL(LOOPBACK + "/v1/chat/completions").openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(3500);
            connection.setReadTimeout(120000);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Accept", "application/json");
            connection.setDoOutput(true);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload);
            }
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                deliver(requestId, null, "Lokaler KI-Server antwortet mit HTTP " + status + ".");
                return;
            }
            JSONObject response = new JSONObject(readLimited(connection.getInputStream()));
            JSONArray choices = response.optJSONArray("choices");
            if (choices == null || choices.length() == 0) throw new IllegalStateException("Missing choices");
            JSONObject message = choices.getJSONObject(0).optJSONObject("message");
            String answer = message == null ? "" : message.optString("content", "");
            if (answer.trim().isEmpty()) {
                deliver(requestId, null, "Das lokale Modell hat keine Antwort geliefert.");
                return;
            }
            deliver(requestId, answer.trim(), null);
        } catch (java.net.ConnectException | java.net.SocketTimeoutException network) {
            deliver(requestId, null, "Kein lokaler KI-Server erreichbar. Starte llama-server in Termux auf Port 8080.");
        } catch (Exception failure) {
            deliver(requestId, null, "Lokaler Chat fehlgeschlagen. Bitte Modell und Termux-Server prüfen.");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String readLimited(InputStream input) throws Exception {
        try (InputStream source = input; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = source.read(buffer)) != -1) {
                if (bytes.size() + count > MAX_RESPONSE_BYTES) throw new IllegalStateException("Response too large");
                bytes.write(buffer, 0, count);
            }
            return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private void deliver(String requestId, String answer, String error) {
        activity.runOnUiThread(() -> callback.onResult(requestId, answer, error));
    }

    /** Show only the actually running GGUF model. No model is silently swapped. */
    void getActiveModel(java.util.function.BiConsumer<String, String> callback) {
        executor.execute(() -> {
            HttpURLConnection connection = null;
            String id = null, error = null;
            try {
                connection = (HttpURLConnection) new URL(LOOPBACK + "/v1/models").openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(2500);
                connection.setReadTimeout(4000);
                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK)
                    throw new IllegalStateException("HTTP");
                JSONArray items = new JSONObject(readLimited(connection.getInputStream())).optJSONArray("data");
                if (items == null || items.length() == 0) throw new IllegalStateException("Keine Modelle");
                id = items.getJSONObject(0).optString("id", "");
                if (id.length() > 200) id = id.substring(0, 200);
            } catch (Exception e) {
                error = "Starte llama-server in Termux auf Port 8080.";
            } finally {
                if (connection != null) connection.disconnect();
            }
            final String modelName = id, message = error;
            activity.runOnUiThread(() -> callback.accept(modelName, message));
        });
    }

    void destroy() {
        executor.shutdownNow();
    }
}
