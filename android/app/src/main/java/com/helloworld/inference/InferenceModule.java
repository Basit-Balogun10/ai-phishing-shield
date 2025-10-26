package com.helloworld.inference;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.util.Log;
import android.util.Pair;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

import org.tensorflow.lite.Interpreter;

import java.io.BufferedReader;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.Set;
import java.util.HashSet;
import java.util.Arrays;
import java.util.Collections;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Minimal TFLite inference module. Loads a model from assets (phishing_detector_dynamic.tflite)
 * and exposes a single analyzeNotification(text) method. Tokenizer and preprocessing are kept
 * simple here and should be replaced with a production tokenizer matching the training pipeline.
 */
@ReactModule(name = InferenceModule.NAME)
public class InferenceModule extends ReactContextBaseJavaModule {
    public static final String NAME = "InferenceModule";
    private static final String TAG = "InferenceModule";

    private Interpreter interpreter;
    private Map<String, Integer> vocab;
    private int padId = 0;
    private int unkId = 1;
    private int clsId = -1;
    private int sepId = -1;
    private int maxLen = 128; // default, will try to read from metadata
    private float heuristicWeight = 0.2f;
    private float thrLow = 0.5f;
    private float thrMed = 0.6f;
    private float thrHigh = 0.75f;
    private JSONObject tokenizerConfig = null;
    private JSONObject metadataJson = null;

    public InferenceModule(ReactApplicationContext reactContext) {
        super(reactContext);
        try {
            // load model
            MappedByteBuffer model = loadModelFile(reactContext, "phishing_detector_dynamic.tflite");
            interpreter = new Interpreter(model);
            Log.i(TAG, "TFLite model loaded");

            // parse model-metadata.json robustly
            try (InputStream metaIn = reactContext.getAssets().open("model-metadata.json")) {
                BufferedReader br = new BufferedReader(new InputStreamReader(metaIn));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                String json = sb.toString();
                try {
                    metadataJson = new JSONObject(json);
                    if (metadataJson.has("max_length")) {
                        maxLen = metadataJson.optInt("max_length", maxLen);
                    }
                    if (metadataJson.has("heuristic_weight")) {
                        heuristicWeight = (float) metadataJson.optDouble("heuristic_weight", heuristicWeight);
                    }
                    if (metadataJson.has("severity_thresholds")) {
                        JSONObject thr = metadataJson.optJSONObject("severity_thresholds");
                        if (thr != null) {
                            thrLow = (float) thr.optDouble("low", thrLow);
                            thrMed = (float) thr.optDouble("medium", thrMed);
                            thrHigh = (float) thr.optDouble("high", thrHigh);
                        }
                    }
                } catch (JSONException je) {
                    // ignore and use defaults
                }
            } catch (Exception e) {
                // ignore, use defaults
            }

            // load vocab
            vocab = loadVocab(reactContext.getAssets(), "tokenizer/vocab.txt");
            if (vocab != null) {
                if (vocab.containsKey("[PAD]")) padId = vocab.get("[PAD]");
                if (vocab.containsKey("[UNK]")) unkId = vocab.get("[UNK]");
                if (vocab.containsKey("[CLS]")) clsId = vocab.get("[CLS]");
                if (vocab.containsKey("[SEP]")) sepId = vocab.get("[SEP]");
            }

            // try to load tokenizer.json for WordPiece config
            try (InputStream in = reactContext.getAssets().open("tokenizer/tokenizer.json")) {
                BufferedReader br = new BufferedReader(new InputStreamReader(in));
                StringBuilder sb = new StringBuilder();
                String l;
                while ((l = br.readLine()) != null) sb.append(l);
                tokenizerConfig = new JSONObject(sb.toString());
            } catch (Exception ignored) {
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to load TFLite model or tokenizer", e);
        }
    }

    @Override
    public String getName() {
        return NAME;
    }

    private MappedByteBuffer loadModelFile(Context context, String assetName) throws IOException {
        // Use AssetFileDescriptor mapping — works reliably when file is packed in APK assets
        AssetFileDescriptor afd = context.getAssets().openFd(assetName);
        FileInputStream inputStream = new FileInputStream(afd.getFileDescriptor());
        FileChannel fileChannel = inputStream.getChannel();
        long startOffset = afd.getStartOffset();
        long declaredLength = afd.getLength();
        return fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength);
    }

    @ReactMethod
    public void analyzeNotification(String text, Promise promise) {
        try {
            if (interpreter == null) {
                promise.reject("no_model", "TFLite model not loaded");
                return;
            }
            long start = System.nanoTime();

            // Tokenize into input ids and attention mask
            int[] inputIds = tokenizeToIds(text, maxLen);
            int[] attention = new int[maxLen];
            for (int i = 0; i < maxLen; i++) {
                attention[i] = (inputIds[i] != padId) ? 1 : 0;
            }

            // Prepare batch inputs (1, maxLen)
            int[][] inputIdsBatch = new int[1][maxLen];
            int[][] attentionBatch = new int[1][maxLen];
            inputIdsBatch[0] = inputIds;
            attentionBatch[0] = attention;

            Object[] inputs = new Object[]{inputIdsBatch, attentionBatch};

            // Prepare output buffer dynamically based on model output shape
            int[] outShape = interpreter.getOutputTensor(0).shape();
            int outLen = 1;
            if (outShape != null && outShape.length > 0) {
                outLen = outShape[outShape.length - 1];
            }
            float[][] outBuf = new float[1][outLen];
            Map<Integer, Object> outputs = new HashMap<>();
            outputs.put(0, outBuf);

            // Attempt to resize inputs if interpreter supports it
            try {
                interpreter.resizeInput(0, new int[]{1, maxLen});
                if (interpreter.getInputTensorCount() > 1) {
                    interpreter.resizeInput(1, new int[]{1, maxLen});
                }
            } catch (Exception ignored) {
            }
            try {
                interpreter.allocateTensors();
            } catch (Exception ignored) {
            }

            // Run inference
            interpreter.runForMultipleInputsOutputs(inputs, outputs);

            long end = System.nanoTime();
            int latencyMs = (int) TimeUnit.NANOSECONDS.toMillis(end - start);

            // Dequantize output if quantized
            try {
                // attempt to read quantization params via reflection-safe calls
                Object tensor = interpreter.getOutputTensor(0);
                float scale = 0f;
                int zeroPoint = 0;
                try {
                    // Tensor.getQuantizationParams() exists on many versions
                    java.lang.reflect.Method m = tensor.getClass().getMethod("getQuantizationParams");
                    Object qp = m.invoke(tensor);
                    java.lang.reflect.Method getScale = qp.getClass().getMethod("getScale");
                    java.lang.reflect.Method getZero = qp.getClass().getMethod("getZeroPoint");
                    Object s = getScale.invoke(qp);
                    Object z = getZero.invoke(qp);
                    if (s instanceof Number) scale = ((Number) s).floatValue();
                    if (z instanceof Number) zeroPoint = ((Number) z).intValue();
                } catch (NoSuchMethodException nsme) {
                    // try alternative method names
                    try {
                        java.lang.reflect.Method m2 = tensor.getClass().getMethod("quantizationParams");
                        Object qp = m2.invoke(tensor);
                        java.lang.reflect.Method getScale = qp.getClass().getMethod("getScale");
                        java.lang.reflect.Method getZero = qp.getClass().getMethod("getZeroPoint");
                        Object s = getScale.invoke(qp);
                        Object z = getZero.invoke(qp);
                        if (s instanceof Number) scale = ((Number) s).floatValue();
                        if (z instanceof Number) zeroPoint = ((Number) z).intValue();
                    } catch (Exception ignored) {
                    }
                } catch (Exception ignored) {
                }

                if (scale != 0f) {
                    for (int i = 0; i < outBuf[0].length; i++) {
                        outBuf[0][i] = (outBuf[0][i] - zeroPoint) * scale;
                    }
                }
            } catch (Exception ignored) {
            }

            float score = 0f;
            if (outLen == 1) {
                // sigmoid
                float logit = outBuf[0][0];
                score = (float) (1.0 / (1.0 + Math.exp(-logit)));
            } else if (outLen == 2) {
                float a = outBuf[0][0];
                float b = outBuf[0][1];
                float max = Math.max(a, b);
                float ex0 = (float) Math.exp(a - max);
                float ex1 = (float) Math.exp(b - max);
                float sum = ex0 + ex1;
                float p1 = ex1 / sum;
                score = p1;
            } else {
                // fallback softmax over last dim
                float max = outBuf[0][0];
                for (int i = 1; i < outLen; i++) max = Math.max(max, outBuf[0][i]);
                float sum = 0f;
                float[] ex = new float[outLen];
                for (int i = 0; i < outLen; i++) {
                    ex[i] = (float) Math.exp(outBuf[0][i] - max);
                    sum += ex[i];
                }
                if (sum == 0f) sum = 1f;
                float p1 = outLen > 1 ? ex[1] / sum : ex[0] / sum;
                score = p1;
            }

            // clamp like the Python wrapper / frontend: never expose exact 1.0
            // compute heuristics and combine with model score to match Python wrapper
            // Heuristic explainability using per-language rules where available
            JSONObject rules = loadLanguageRules("en");
            try {
                String lang = "en";
                if (metadataJson != null && metadataJson.has("training_languages")) {
                    // keep default en unless payload provides language - we don't have payload language here
                }
            } catch (Exception ignored) {
            }

            String body = text == null ? "" : text;
            List<JSONObject> factors = new ArrayList<>();
            float heuristicScore = 0f;

            // urgency
            float urgency = urgencyScore(body, rules);
            if (urgency > 0f) {
                float urgency_w = (float) rules.optDouble("urgency_weight", 0.25);
                float w = Math.min(1.0f, urgency) * urgency_w;
                JSONObject f = new JSONObject();
                try { f.put("label", "Urgency language"); f.put("excerpt", body.substring(0, Math.min(120, body.length()))); f.put("weight", Math.round(w*100.0)/100.0); f.put("evidenceType", "keyword"); } catch (JSONException e) {}
                factors.add(f);
                heuristicScore += w;
            }

            // urls
            List<Pair<String, String>> urls = extractUrls(body);
            if (urls.size() > 0) {
                for (Pair<String, String> u : urls) {
                    boolean isShort = isShortLink(u.second);
                    float url_weight = (float) (isShort ? rules.optDouble("short_link_weight", 0.18) : rules.optDouble("link_weight", 0.05));
                    JSONObject f = new JSONObject();
                    try { f.put("label", isShort ? "Suspicious link" : "Link"); f.put("excerpt", u.first); f.put("weight", Math.round(url_weight*100.0)/100.0); f.put("evidenceType", "url_reputation"); } catch (JSONException e) {}
                    factors.add(f);
                    heuristicScore += url_weight;
                }
            }

            // otp
            if (detectOtp(body, rules.optString("otp_pattern", null))) {
                float otp_w = (float) rules.optDouble("otp_weight", 0.12);
                JSONObject f = new JSONObject();
                try { f.put("label", "OTP/Verification code"); f.put("excerpt", "numeric code present"); f.put("weight", otp_w); f.put("evidenceType", "otp"); } catch (JSONException e) {}
                factors.add(f);
                heuristicScore += otp_w;
            }

            // money / reward / account
            if (Pattern.compile(rules.optString("money_regex", "(bank|account|transfer|withdraw|deposit|balance|pay|gbp|ngn|naira|dollar|credit|debit)"), Pattern.CASE_INSENSITIVE).matcher(body).find()) {
                float mw = (float) rules.optDouble("money_keyword_weight", 0.2);
                JSONObject f = new JSONObject();
                try { f.put("label", "Financial keyword"); f.put("excerpt", body.substring(0, Math.min(80, body.length()))); f.put("weight", Math.round(mw*100.0)/100.0); f.put("evidenceType", "keyword"); } catch (JSONException e) {}
                factors.add(f);
                heuristicScore += mw;
            }
            if (Pattern.compile(rules.optString("reward_regex", "(prize|lottery|winner|congratulations|reward|gift|selected)"), Pattern.CASE_INSENSITIVE).matcher(body).find()) {
                float rw = (float) rules.optDouble("reward_keyword_weight", 0.18);
                JSONObject f = new JSONObject();
                try { f.put("label", "Reward / lottery"); f.put("excerpt", body.substring(0, Math.min(80, body.length()))); f.put("weight", Math.round(rw*100.0)/100.0); f.put("evidenceType", "keyword"); } catch (JSONException e) {}
                factors.add(f);
                heuristicScore += rw;
            }
            if (Pattern.compile(rules.optString("account_regex", "(verify|confirm|update|suspend|activate|deactivate|reactivate)"), Pattern.CASE_INSENSITIVE).matcher(body).find()) {
                float aw = (float) rules.optDouble("account_keyword_weight", 0.2);
                JSONObject f = new JSONObject();
                try { f.put("label", "Account action requested"); f.put("excerpt", body.substring(0, Math.min(80, body.length()))); f.put("weight", Math.round(aw*100.0)/100.0); f.put("evidenceType", "keyword"); } catch (JSONException e) {}
                factors.add(f);
                heuristicScore += aw;
            }

            heuristicScore = Math.min(heuristicScore, 1.0f);

            float combinedScore = (score * (1.0f - heuristicWeight)) + (heuristicScore * heuristicWeight);
            float finalScore = Math.min(Math.max(combinedScore, 0f), 0.99f);
            finalScore = (float) (Math.round(finalScore * 100.0) / 100.0);

            float confidence = Math.max( Math.max(0.0f, Math.min(1.0f, Math.max(score, 1.0f-score))) , Math.min(1.0f, 0.5f + heuristicScore * 0.5f));
            float finalConfidence = Math.min(Math.max(confidence, 0f), 0.99f);
            finalConfidence = (float)(Math.round(finalConfidence*100.0)/100.0);

            String severity;
            if (finalScore >= thrHigh) severity = "high";
            else if (finalScore >= thrMed) severity = "medium";
            else if (finalScore >= thrLow) severity = "low";
            else severity = "safe";

            Map<String, Object> result = new HashMap<>();
            result.put("score", (double) finalScore);
            result.put("detectionId", UUID.randomUUID().toString());
            result.put("modelVersion", metadataJson != null ? metadataJson.optString("modelVersion", "native-tflite") : "native-tflite");
            result.put("createdAt", java.time.Instant.now().toString());
            result.put("latencyMs", latencyMs);

            Map<String, Object> message = new HashMap<>();
            message.put("messageId", null);
            message.put("channel", "notification");
            message.put("sender", null);
            message.put("receivedAt", null);
            result.put("message", message);

            // matches from factors
            List<Map<String,Object>> matches = new ArrayList<>();
            for (JSONObject f : factors) {
                Map<String,Object> m = new HashMap<>();
                m.put("label", f.optString("label"));
                m.put("excerpt", f.optString("excerpt"));
                m.put("weight", f.optDouble("weight", 0.0));
                matches.add(m);
            }
            result.put("matches", matches);

            Map<String, Object> risk = new HashMap<>();
            risk.put("score", (double) finalScore);
            risk.put("severity", severity);
            risk.put("label", finalScore >= 0.5f ? "Likely phishing" : "Likely safe");
            risk.put("confidence", (double) finalConfidence);
            risk.put("factors", factors);
            result.put("risk", risk);

            Map<String,Object> actions = new HashMap<>();
            actions.put("recommended", severity.equals("high") ? "block_sender" : "report");
            actions.put("rationale", "heuristic + model score");
            actions.put("secondary", new ArrayList<>());
            result.put("actions", actions);

            Map<String,Object> metadata = new HashMap<>();
            Map<String,Object> channelFeatures = new HashMap<>();
            List<Map<String,String>> urlsOut = new ArrayList<>();
            for (Pair<String,String> u : urls) {
                Map<String,String> mm = new HashMap<>(); mm.put("url", u.first); mm.put("domain", u.second); urlsOut.add(mm);
            }
            channelFeatures.put("links", urlsOut);
            channelFeatures.put("language", "en");
            metadata.put("channelFeatures", channelFeatures);
            List<String> exps = new ArrayList<>(); exps.add("Result from model " + (metadataJson!=null?metadataJson.optString("modelVersion", "native-tflite") : "native-tflite"));
            metadata.put("explanations", exps);
            Map<String,Object> heur = new HashMap<>(); heur.put("looksLikeOtpCapture", detectOtp(body, rules.optString("otp_pattern", null))); heur.put("urgencyScore", Math.round(urgency*100.0)/100.0);
            metadata.put("heuristics", heur);
            result.put("metadata", metadata);

            result.put("raw_model_score", (double) score);
            result.put("heuristic_score", (double) Math.round(heuristicScore*10000.0)/10000.0);
            result.put("combined_score_pre_clamp", (double) Math.round(combinedScore*10000.0)/10000.0);

            promise.resolve(result);
        } catch (Exception e) {
            Log.w(TAG, "analyzeNotification failed", e);
            promise.reject("inference_error", e);
        }
    }

    private Map<String, Integer> loadVocab(AssetManager assets, String path) {
        Map<String, Integer> map = new HashMap<>();
        try (InputStream in = assets.open(path);
             BufferedReader br = new BufferedReader(new InputStreamReader(in))) {
            String line;
            int idx = 0;
            while ((line = br.readLine()) != null) {
                String token = line.trim();
                if (!token.isEmpty()) {
                    map.put(token, idx);
                    idx++;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to load vocab", e);
            return null;
        }
        return map;
    }

    private int[] tokenizeToIds(String text, int maxLen) {
        int[] ids = new int[maxLen];
        for (int i = 0; i < maxLen; i++) ids[i] = padId;

        if (vocab == null) {
            // fallback: empty input
            ids[0] = clsId >= 0 ? clsId : unkId;
            if (sepId >= 0 && maxLen > 1) ids[1] = sepId;
            return ids;
        }

        List<Integer> toks = new ArrayList<>();
        if (clsId >= 0) toks.add(clsId);

        // WordPiece-style tokenization using tokenizerConfig and vocab
        int maxCharsPerWord = 100;
        if (tokenizerConfig != null) {
            try {
                JSONObject model = tokenizerConfig.optJSONObject("model");
                if (model != null) maxCharsPerWord = model.optInt("max_input_chars_per_word", maxCharsPerWord);
            } catch (Exception ignored) {}
        }

        // Basic pre-tokenization: split on whitespace and keep punctuation tokens
        List<String> words = new ArrayList<>();
        if (text != null) {
            // split into sequences of letters/digits or single non-space chars
            Matcher m = Pattern.compile("[\\p{L}\\p{N}]+|[^\\s\\p{L}\\p{N}]+").matcher(text);
            while (m.find()) words.add(m.group());
        }

        for (String w : words) {
            if (w.length() == 0) continue;
            if (w.length() > maxCharsPerWord) {
                toks.add(unkId);
                continue;
            }

            String word = w;
            boolean doLower = false;
            if (tokenizerConfig != null) {
                try {
                    JSONObject norm = tokenizerConfig.optJSONObject("normalizer");
                    if (norm != null) doLower = norm.optBoolean("lowercase", false);
                } catch (Exception ignored) {}
            }
            String processed = doLower ? word.toLowerCase(Locale.ROOT) : word;

            int start = 0;
            boolean isBad = false;
            List<String> subTokens = new ArrayList<>();
            while (start < processed.length()) {
                int end = processed.length();
                String curSubstr = null;
                while (start < end) {
                    String substr = processed.substring(start, end);
                    String candidate = (start > 0) ? ("##" + substr) : substr;
                    if (vocab.containsKey(candidate)) {
                        curSubstr = candidate;
                        break;
                    }
                    // try original case as well
                    if (vocab.containsKey(substr)) {
                        curSubstr = substr;
                        break;
                    }
                    end -= 1;
                }
                if (curSubstr == null) {
                    isBad = true;
                    break;
                }
                subTokens.add(curSubstr);
                start = end;
            }
            if (isBad) {
                toks.add(unkId);
            } else {
                for (String tk : subTokens) {
                    Integer id = vocab.get(tk);
                    if (id == null) id = unkId;
                    toks.add(id);
                }
            }

            if (toks.size() >= maxLen - 1) break;
        }

        if (sepId >= 0 && toks.size() < maxLen) toks.add(sepId);

        // truncate if needed
        if (toks.size() > maxLen) toks = toks.subList(0, maxLen);

        for (int i = 0; i < toks.size() && i < maxLen; i++) ids[i] = toks.get(i);
        return ids;
    }

    private JSONObject loadLanguageRules(String language) {
        // fallback defaults similar to Python wrapper
        JSONObject defaults = new JSONObject();
        try {
            defaults.put("urgency_keywords", new org.json.JSONArray(Arrays.asList("urgent","immediately","now","within 24","suspend","suspended","verify","verify now","click")));
            defaults.put("money_regex", "(bank|account|transfer|withdraw|deposit|balance|pay|gbp|ngn|naira|dollar|credit|debit)");
            defaults.put("reward_regex", "(prize|lottery|winner|congratulations|reward|gift|selected)");
            defaults.put("account_regex", "(verify|confirm|update|suspend|activate|deactivate|reactivate)");
            defaults.put("otp_pattern", "\\b\\d{4,6}\\b");
            defaults.put("urgency_weight", 0.25);
            defaults.put("short_link_weight", 0.18);
            defaults.put("link_weight", 0.05);
            defaults.put("money_keyword_weight", 0.2);
            defaults.put("reward_keyword_weight", 0.18);
            defaults.put("account_keyword_weight", 0.2);
            defaults.put("otp_weight", 0.12);
        } catch (JSONException e) {
            // ignore
        }

        // try to read assets/rules/<language>.json, then default.json
        AssetManager assets = getReactApplicationContext().getAssets();
            try (InputStream in = assets.open("rules/" + language + ".json")) {
            BufferedReader br = new BufferedReader(new InputStreamReader(in));
            StringBuilder sb = new StringBuilder();
            String l;
            while ((l = br.readLine()) != null) sb.append(l);
            JSONObject j = new JSONObject(sb.toString());
            // merge j into defaults
            java.util.Iterator<String> keysIter = j.keys();
            while (keysIter.hasNext()) {
                String key = keysIter.next();
                defaults.put(key, j.get(key));
            }
            return defaults;
        } catch (Exception ignored) {
        }
        try (InputStream in = assets.open("rules/default.json")) {
            BufferedReader br = new BufferedReader(new InputStreamReader(in));
            StringBuilder sb = new StringBuilder();
            String l;
            while ((l = br.readLine()) != null) sb.append(l);
            JSONObject j = new JSONObject(sb.toString());
            java.util.Iterator<String> keysIter2 = j.keys();
            while (keysIter2.hasNext()) {
                String key = keysIter2.next();
                defaults.put(key, j.get(key));
            }
            return defaults;
        } catch (Exception ignored) {
        }
        return defaults;
    }

    private List<Pair<String,String>> extractUrls(String text) {
        List<Pair<String,String>> urls = new ArrayList<>();
        if (text == null) return urls;
        Pattern urlRe = Pattern.compile("https?://[\\w\\-\\./?%&=~#]+", Pattern.CASE_INSENSITIVE);
        Matcher m = urlRe.matcher(text);
        while (m.find()) {
            String u = m.group(0);
            String domain = u.replaceFirst("https?://", "").split("/")[0];
            urls.add(new Pair<>(u, domain));
        }
        return urls;
    }

    private boolean isShortLink(String domain) {
        if (domain == null) return false;
        String d = domain.toLowerCase(Locale.ROOT);
        Set<String> SHORTENERS = new HashSet<>(Arrays.asList("bit.ly","tinyurl.com","t.co","cutt.ly","goo.gl","ow.ly","is.gd","tiny.cc"));
        if (SHORTENERS.contains(d)) return true;
        String name = d.split(":")[0];
        name = name.split("@")[name.split("@").length - 1];
        if (name.split("\\.")[0].length() <= 6) return true;
        return false;
    }

    private boolean detectOtp(String text, String pattern) {
        if (text == null) return false;
        if (pattern != null && pattern.length() > 0) {
            try {
                return Pattern.compile(pattern).matcher(text).find();
            } catch (Exception ignored) {}
        }
        return Pattern.compile("\\b\\d{4,6}\\b").matcher(text).find();
    }

    private float urgencyScore(String text, JSONObject rules) {
        if (text == null) return 0f;
        try {
            org.json.JSONArray arr = rules.optJSONArray("urgency_keywords");
            if (arr == null) return 0f;
            String t = text.toLowerCase(Locale.ROOT);
            int count = 0;
            for (int i = 0; i < arr.length(); i++) {
                String k = arr.optString(i, "");
                if (k.length() == 0) continue;
                if (t.contains(k.toLowerCase(Locale.ROOT))) count += 1;
            }
            return Math.min(1.0f, ((float) count) / 3.0f);
        } catch (Exception e) {
            return 0f;
        }
    }
}
