package com.helix.studio;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import java.util.ArrayList;

/**
 * User-initiated German speech commands. On-device recognizer only: no cloud fallback.
 * Recognition never runs in the background and never speaks an automatic response.
 */
final class HelixVoiceController {
    static final int MICROPHONE_PERMISSION_REQUEST = 71;

    interface Callback {
        void onResult(String transcript);
        void onStatus(String status);
    }

    private final Activity activity;
    private final Callback callback;
    private SpeechRecognizer recognizer;
    private boolean permissionPending;

    HelixVoiceController(Activity activity, Callback callback) {
        this.activity = activity;
        this.callback = callback;
    }

    void start() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            callback.onStatus("Offline-Spracherkennung benötigt Android 12 oder neuer. Texteingabe bleibt verfügbar.");
            return;
        }
        if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(activity)) {
            callback.onStatus("Keine lokale Spracherkennung installiert. Bitte deutsche Offline-Sprachdaten einrichten oder tippen.");
            return;
        }
        if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            permissionPending = true;
            callback.onStatus("Bitte Mikrofonzugriff erlauben.");
            activity.requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, MICROPHONE_PERMISSION_REQUEST);
            return;
        }
        permissionPending = false;
        beginRecognition();
    }

    void onRequestPermissionsResult(int requestCode, int[] grantResults) {
        if (requestCode != MICROPHONE_PERMISSION_REQUEST || !permissionPending) return;
        permissionPending = false;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            start();
        } else {
            callback.onStatus("Mikrofonzugriff abgelehnt. Texteingabe bleibt verfügbar.");
        }
    }

    private void beginRecognition() {
        cancel();
        try {
            recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(activity);
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {
                    callback.onStatus("Ich höre zu …");
                }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float rmsdB) { }
                @Override public void onBufferReceived(byte[] buffer) { }
                @Override public void onEndOfSpeech() {
                    callback.onStatus("Sprache wird erkannt …");
                }
                @Override public void onError(int error) {
                    releaseRecognizer();
                    if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)
                        callback.onStatus("Nichts erkannt. Erneut sprechen oder Befehl eintippen.");
                    else if (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED ||
                             error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)
                        callback.onStatus("Deutsch ist für die lokale Erkennung nicht verfügbar. Offline-Sprachdaten prüfen.");
                    else if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS)
                        callback.onStatus("Mikrofonzugriff fehlt. Texteingabe bleibt verfügbar.");
                    else
                        callback.onStatus("Lokale Erkennung fehlgeschlagen (" + error + "). Bitte erneut versuchen oder tippen.");
                }
                @Override public void onResults(Bundle results) {
                    ArrayList<String> hypotheses = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String text = hypotheses == null || hypotheses.isEmpty() ? "" : hypotheses.get(0);
                    releaseRecognizer();
                    if (text == null || text.trim().isEmpty())
                        callback.onStatus("Nichts erkannt. Erneut sprechen oder tippen.");
                    else
                        callback.onResult(text);
                }
                @Override public void onPartialResults(Bundle results) { }
                @Override public void onEvent(int eventType, Bundle params) { }
            });
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "de-DE");
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "de-DE");
            intent.putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, false);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            recognizer.startListening(intent);
            callback.onStatus("Lokale Spracherkennung startet …");
        } catch (RuntimeException error) {
            releaseRecognizer();
            callback.onStatus("Lokale Spracherkennung konnte nicht starten. Texteingabe bleibt verfügbar.");
        }
    }

    private void releaseRecognizer() {
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
    }

    void cancel() {
        permissionPending = false;
        if (recognizer != null) {
            recognizer.cancel();
            releaseRecognizer();
        }
    }

    void destroy() {
        cancel();
    }
}
