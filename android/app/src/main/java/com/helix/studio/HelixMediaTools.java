package com.helix.studio;

import android.app.Activity;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import java.io.File;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Offline MP4 video + AAC voice muxing and user-initiated M4A voice recording. */
final class HelixMediaTools {
    interface Callback { void onStatus(String status, String path, boolean success); }
    private final Activity activity;
    private final Callback callback;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private Uri video;
    private Uri audio;
    private MediaRecorder recorder;
    private File recordingFile;
    private boolean recording = false;
    private boolean busy = false;

    HelixMediaTools(Activity activity, Callback callback) {
        this.activity = activity;
        this.callback = callback;
    }
    void setVideo(Uri uri) { video = uri; report("Video ausgewählt. Jetzt die Voice-Datei wählen.", null, true); }
    void setAudio(Uri uri) { audio = uri; report("Audio ausgewählt. Video und Voice können verbunden werden.", null, true); }
    void startRecording() {
        if (recording || busy) { report("Aufnahme oder Export läuft bereits.", null, false); return; }
        try {
            File directory = activity.getExternalFilesDir(Environment.DIRECTORY_MUSIC);
            if (directory == null) throw new IllegalStateException();
            if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException();
            recordingFile = new File(directory, "helix-voice-" + System.currentTimeMillis() + ".m4a");
            recorder = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(activity) : new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioEncodingBitRate(128000);
            recorder.setAudioSamplingRate(44100);
            recorder.setMaxDuration(60000);
            recorder.setOutputFile(recordingFile.getAbsolutePath());
            recorder.setOnInfoListener((r, what, extra) -> {
                if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) main.post(this::stopRecording);
            });
            recorder.prepare();
            recorder.start();
            recording = true;
            report("Aufnahme läuft (maximal 60 Sekunden). Zum Beenden erneut tippen.", null, true);
        } catch (Exception error) {
            releaseRecorder();
            report("Aufnahme konnte nicht starten. Mikrofonberechtigung prüfen.", null, false);
        }
    }
    void stopRecording() {
        if (!recording) { report("Keine laufende Aufnahme.", null, false); return; }
        boolean saved = true;
        try { recorder.stop(); } catch (RuntimeException error) { saved = false; }
        releaseRecorder();
        if (saved && recordingFile != null && recordingFile.exists() && recordingFile.length() > 0) {
            audio = Uri.fromFile(recordingFile);
            report("Lokale Voice gespeichert und als Tonspur ausgewählt.", recordingFile.getAbsolutePath(), true);
        } else {
            if (recordingFile != null) recordingFile.delete();
            report("Aufnahme fehlgeschlagen. Mindestens eine Sekunde aufnehmen.", null, false);
        }
    }
    boolean isRecording() { return recording; }
    private void releaseRecorder() {
        recording = false;
        if (recorder != null) {
            try { recorder.reset(); recorder.release(); } catch (Exception ignored) { }
            recorder = null;
        }
    }
    void merge() {
        if (busy) { report("Export läuft bereits.", null, false); return; }
        if (video == null || audio == null) {
            report("Bitte zuerst ein Video und eine AAC/M4A-Voice auswählen.", null, false);
            return;
        }
        busy = true;
        Uri v = video, a = audio;
        report("Lokaler MP4-Export gestartet. Keine Cloud.", null, true);
        worker.execute(() -> {
            File output = null;
            try {
                File folder = activity.getExternalFilesDir(Environment.DIRECTORY_MOVIES);
                if (folder == null || (!folder.exists() && !folder.mkdirs())) throw new IllegalStateException("Kein Ausgabeordner");
                output = new File(folder, "helix-video-voice-" + System.currentTimeMillis() + ".mp4");
                mux(v, a, output);
                File saved = output;
                report("MP4 mit neuer Tonspur gespeichert.", saved.getAbsolutePath(), true);
            } catch (Exception error) {
                if (output != null) output.delete();
                report("Export fehlgeschlagen. Benötigt MP4-Video und AAC/M4A-Audio. " + error.getClass().getSimpleName(), null, false);
            } finally { busy = false; }
        });
    }
    private void mux(Uri v, Uri a, File output) throws Exception {
        MediaExtractor videoExtractor = new MediaExtractor();
        MediaExtractor audioExtractor = new MediaExtractor();
        MediaMuxer muxer = null;
        boolean started = false;
        try {
            videoExtractor.setDataSource(activity, v, null);
            audioExtractor.setDataSource(activity, a, null);
            int videoIndex = findTrack(videoExtractor, "video/");
            int audioIndex = findTrack(audioExtractor, "audio/");
            if (videoIndex < 0 || audioIndex < 0) throw new IllegalArgumentException("Spur fehlt");
            MediaFormat vFmt = videoExtractor.getTrackFormat(videoIndex);
            MediaFormat aFmt = audioExtractor.getTrackFormat(audioIndex);
            String videoMime = vFmt.getString(MediaFormat.KEY_MIME);
            String audioMime = aFmt.getString(MediaFormat.KEY_MIME);
            if (!("video/avc".equals(videoMime) || "video/hevc".equals(videoMime) || "video/mp4v-es".equals(videoMime)))
                throw new IllegalArgumentException("Videoformat nicht unterstützt");
            if (!"audio/mp4a-latm".equals(audioMime))
                throw new IllegalArgumentException("Ton muss AAC/M4A sein");
            videoExtractor.selectTrack(videoIndex);
            audioExtractor.selectTrack(audioIndex);
            muxer = new MediaMuxer(output.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int outputVideo = muxer.addTrack(vFmt);
            int outputAudio = muxer.addTrack(aFmt);
            if (vFmt.containsKey(MediaFormat.KEY_ROTATION)) muxer.setOrientationHint(vFmt.getInteger(MediaFormat.KEY_ROTATION));
            muxer.start();
            started = true;
            copyTrack(videoExtractor, muxer, outputVideo);
            copyTrack(audioExtractor, muxer, outputAudio);
        } finally {
            if (muxer != null) {
                if (started) { try { muxer.stop(); } catch (Exception ignored) { } }
                muxer.release();
            }
            videoExtractor.release();
            audioExtractor.release();
        }
    }
    private static int findTrack(MediaExtractor extractor, String prefix) {
        for (int i = 0; i < extractor.getTrackCount(); i++) {
            String mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith(prefix)) return i;
        }
        return -1;
    }
    private static void copyTrack(MediaExtractor extractor, MediaMuxer muxer, int outputIndex) {
        ByteBuffer buffer = ByteBuffer.allocateDirect(8 * 1024 * 1024);
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        long startTimestamp = -1;
        while (true) {
            buffer.clear();
            int bytes = extractor.readSampleData(buffer, 0);
            if (bytes < 0) break;
            if (bytes > buffer.capacity()) throw new IllegalStateException("Frame zu groß");
            long time = extractor.getSampleTime();
            if (time < 0) break;
            if (startTimestamp < 0) startTimestamp = time;
            info.offset = 0;
            info.size = bytes;
            info.presentationTimeUs = Math.max(0L, time - startTimestamp);
            info.flags = extractor.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC;
            muxer.writeSampleData(outputIndex, buffer, info);
            extractor.advance();
        }
    }
    private void report(String status, String path, boolean success) {
        main.post(() -> callback.onStatus(status, path, success));
    }
    void destroy() {
        if (recording) stopRecording();
        else releaseRecorder();
        worker.shutdownNow();
    }
}
