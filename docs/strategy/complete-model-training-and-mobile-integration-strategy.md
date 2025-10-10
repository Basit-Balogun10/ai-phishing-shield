# 🚀 Complete Model Training & Mobile Integration Strategy

## Overview: The Two Parallel Tracks

### Track 1: Mobile Dev (Your Partner)
**Timeline:** Days 1-6
- ✅ Phase 1: App skeleton + UI (Days 1-2)
- ✅ Phase 2: Background service + **mock detection** (Days 3-4)
- ⏸️ Phase 3: Wait for your `.tflite` model (Day 5)
- 🔄 Phase 3: Model integration (Day 5-6)
- ✨ Phase 4: Polish (Days 7-8)

### Track 2: You (Data + AI)
**Timeline:** Days 1-6
- ✅ Day 1: Data collection (TODAY - already in progress!)
- 🔥 Days 2-3: Model training + optimization
- 📦 Day 4: TFLite conversion + testing
- 🤝 Day 5: Integration support
- 🎨 Days 6-8: Fine-tuning + demo prep

### 🔗 Integration Point (Day 5)
You deliver: `phishing_detector.tflite` (file ~5-20MB)  
He integrates: Replaces mock detection with real model  
Result: Fully functional app!

---

# 📚 WHAT IS "MODEL TRAINING"? (ELI5)

Think of it like teaching a dog to recognize danger:

1. **Collect examples** (✅ You're doing this!) 
   - Show the dog 1000 pictures of dangerous things (phishing messages)
   - Show the dog 1000 pictures of safe things (legitimate messages)

2. **Training = Pattern Learning** (What you'll do next)
   - The "dog" (model) looks at thousands of examples
   - It learns patterns: "Aha! When I see 'URGENT', 'click this link', 'verify account' together, it's danger!"
   - After seeing enough examples, it can recognize new dangerous messages it's never seen

3. **Testing** 
   - Show the trained "dog" new pictures it's never seen
   - Check: Does it correctly identify danger?

4. **Deployment**
   - Package the "dog's brain" into a tiny file (`.tflite`)
   - Put this file in your mobile app
   - Now the app can detect phishing on its own!

**In technical terms:** Training = adjusting millions of numerical weights in a neural network so it learns to classify text as "phishing" or "legitimate" based on patterns in your training data.

---

# 🎓 MODEL TRAINING STRATEGY

## Phase 1: Data Preparation (Day 1 Evening - Day 2 Morning)

### Step 1.1: Combine All Your Data Sources

```python
import pandas as pd
import glob

# Combine everything
synthetic = pd.read_csv('phishing_dataset/all_languages_combined.csv')
chatgpt_data = pd.read_csv('chatgpt_downloaded_data.csv')  # From ChatGPT research
crowdsourced = pd.read_csv('crowdsourced_messages.csv')  # From your Google Form

# Standardize column names
for df in [synthetic, chatgpt_data, crowdsourced]:
    df.columns = df.columns.str.lower()
    if 'spam' in df.columns:
        df['label'] = df['spam'].map({'spam': 'phishing', 'ham': 'legitimate'})

# Combine
all_data = pd.concat([synthetic, chatgpt_data, crowdsourced], ignore_index=True)

# Remove duplicates
all_data = all_data.drop_duplicates(subset=['message'])

print(f"Total dataset size: {len(all_data)}")
print(f"Phishing: {len(all_data[all_data['label']=='phishing'])}")
print(f"Legitimate: {len(all_data[all_data['label']=='legitimate'])}")
```

### Step 1.2: Clean & Validate

```python
# Remove nulls
all_data = all_data.dropna(subset=['message', 'label'])

# Remove too short messages (likely noise)
all_data = all_data[all_data['message'].str.len() > 10]

# Standardize labels
all_data['label'] = all_data['label'].map({
    'phishing': 1,
    'legitimate': 0,
    'spam': 1,
    'ham': 0
})

# Remove any that didn't map
all_data = all_data.dropna(subset=['label'])

# Save cleaned dataset
all_data.to_csv('final_cleaned_dataset.csv', index=False)
print(f"Clean dataset: {len(all_data)} messages")
```

### Step 1.3: Create Train/Val/Test Splits

```python
from sklearn.model_selection import train_test_split

# First split: 80% train+val, 20% test (never touch test until final evaluation)
train_val, test = train_test_split(
    all_data, 
    test_size=0.2, 
    stratify=all_data['label'],
    random_state=42
)

# Second split: 80% train, 20% val
train, val = train_test_split(
    train_val,
    test_size=0.2,
    stratify=train_val['label'],
    random_state=42
)

print(f"Train: {len(train)} | Val: {len(val)} | Test: {len(test)}")

# Save splits
train.to_csv('train.csv', index=False)
val.to_csv('val.csv', index=False)
test.to_csv('test.csv', index=False)
```

---

## Phase 2: Model Selection (Day 2)

### 🎯 The Golden Rule for Your Use Case

**You need:** Small, fast, accurate, multilingual, works offline

**Best Options (in priority order):**

### Option 1: DistilBERT (Multilingual) ⭐ RECOMMENDED
- **Size:** ~135MB → compresses to ~40MB for TFLite
- **Speed:** Fast enough for mobile
- **Accuracy:** 93-96% on SMS phishing
- **Multilingual:** Pre-trained on 104 languages including all yours
- **Why:** Best balance of size, speed, and accuracy

### Option 2: MobileBERT 
- **Size:** ~100MB → ~25MB TFLite
- **Speed:** Fastest
- **Accuracy:** 90-94%
- **Multilingual:** Requires separate training
- **Why:** If you need smaller size

### Option 3: TF-IDF + Logistic Regression (Lightweight Fallback)
- **Size:** <5MB
- **Speed:** Instant
- **Accuracy:** 85-90%
- **Why:** If neural networks don't work on low-end devices

**DECISION:** Start with DistilBERT. It's the sweet spot.

---

## Phase 3: Actual Training Code (Day 2-3)

### Install Requirements

```bash
pip install transformers datasets torch scikit-learn pandas numpy tflite-model-maker
```

### The Complete Training Script

```python
# train_phishing_detector.py
import pandas as pd
import torch
from transformers import (
    AutoTokenizer, 
    AutoModelForSequenceClassification,
    TrainingArguments, 
    Trainer
)
from datasets import Dataset
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

# 1. LOAD DATA
print("Loading data...")
train_df = pd.read_csv('train.csv')
val_df = pd.read_csv('val.csv')
test_df = pd.read_csv('test.csv')

# 2. INITIALIZE MODEL & TOKENIZER
print("Loading model...")
model_name = "distilbert-base-multilingual-cased"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(
    model_name,
    num_labels=2  # Binary: phishing or legitimate
)

# 3. TOKENIZE DATA
def tokenize_function(examples):
    return tokenizer(
        examples['message'],
        padding='max_length',
        truncation=True,
        max_length=128  # Keep it short for mobile
    )

# Convert to HuggingFace Dataset format
train_dataset = Dataset.from_pandas(train_df[['message', 'label']])
val_dataset = Dataset.from_pandas(val_df[['message', 'label']])

train_dataset = train_dataset.map(tokenize_function, batched=True)
val_dataset = val_dataset.map(tokenize_function, batched=True)

# 4. DEFINE TRAINING ARGUMENTS
training_args = TrainingArguments(
    output_dir='./results',
    num_train_epochs=3,  # 3 epochs is usually enough
    per_device_train_batch_size=16,
    per_device_eval_batch_size=32,
    warmup_steps=500,
    weight_decay=0.01,
    logging_dir='./logs',
    logging_steps=100,
    evaluation_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    metric_for_best_model="accuracy",
)

# 5. METRICS
def compute_metrics(pred):
    labels = pred.label_ids
    preds = pred.predictions.argmax(-1)
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, preds, average='binary'
    )
    acc = accuracy_score(labels, preds)
    return {
        'accuracy': acc,
        'f1': f1,
        'precision': precision,
        'recall': recall
    }

# 6. TRAIN!
print("Starting training...")
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
    compute_metrics=compute_metrics,
)

trainer.train()

# 7. EVALUATE ON TEST SET
print("Evaluating on test set...")
test_dataset = Dataset.from_pandas(test_df[['message', 'label']])
test_dataset = test_dataset.map(tokenize_function, batched=True)
results = trainer.evaluate(test_dataset)
print(f"Test Results: {results}")

# 8. SAVE MODEL
print("Saving model...")
model.save_pretrained('./phishing_detector_model')
tokenizer.save_pretrained('./phishing_detector_model')

print("Training complete! ✅")
```

### Run Training

```bash
python train_phishing_detector.py
```

**Expected Training Time:**
- With GPU: 30-60 minutes
- Without GPU (CPU only): 2-4 hours

**What You'll See:**
```
Epoch 1/3: [████████████████] loss: 0.234, accuracy: 0.912
Epoch 2/3: [████████████████] loss: 0.156, accuracy: 0.947
Epoch 3/3: [████████████████] loss: 0.098, accuracy: 0.963
Test Results: {'accuracy': 0.958, 'f1': 0.952, 'precision': 0.961, 'recall': 0.943}
```

---

## Phase 4: Convert to TensorFlow Lite (Day 4)

### Why TFLite?
Your trained model is in PyTorch format (~500MB). Mobile apps need TensorFlow Lite format (~5-40MB) for:
- Smaller size
- Faster inference on mobile CPUs
- Better battery efficiency

### Conversion Script

```python
# convert_to_tflite.py
import torch
import tensorflow as tf
from transformers import TFAutoModelForSequenceClassification, AutoTokenizer

# 1. Load your trained model
print("Loading PyTorch model...")
model_path = './phishing_detector_model'
tokenizer = AutoTokenizer.from_pretrained(model_path)

# 2. Convert to TensorFlow
print("Converting to TensorFlow...")
tf_model = TFAutoModelForSequenceClassification.from_pretrained(
    model_path,
    from_pt=True  # Convert from PyTorch
)

# 3. Save TensorFlow model
tf_model.save_pretrained('./tf_model')

# 4. Convert to TFLite
print("Converting to TFLite...")
converter = tf.lite.TFLiteConverter.from_saved_model('./tf_model')

# Optimizations for mobile
converter.optimizations = [tf.lite.Optimize.DEFAULT]
converter.target_spec.supported_types = [tf.float16]  # Use 16-bit floats

tflite_model = converter.convert()

# 5. Save TFLite model
with open('phishing_detector.tflite', 'wb') as f:
    f.write(tflite_model)

print(f"TFLite model saved! Size: {len(tflite_model) / (1024*1024):.2f} MB")

# 6. Also save tokenizer vocabulary for mobile
tokenizer.save_vocabulary('./')
print("Conversion complete! ✅")
```

### Run Conversion

```bash
python convert_to_tflite.py
```

**Output:**
```
TFLite model saved! Size: 42.3 MB
Conversion complete! ✅
```

You now have:
- `phishing_detector.tflite` (the brain)
- `vocab.txt` (the dictionary)

---

## Phase 5: Test TFLite Model (Day 4)

### Verify It Works

```python
# test_tflite.py
import tensorflow as tf
import numpy as np

# Load TFLite model
interpreter = tf.lite.Interpreter(model_path="phishing_detector.tflite")
interpreter.allocate_tensors()

# Get input/output details
input_details = interpreter.get_input_details()
output_details = interpreter.get_output_details()

# Test message
test_message = "URGENT: Your MTN account suspended. Click https://bit.ly/abc123 to verify"

# Tokenize (you'll need to implement this based on your tokenizer)
# For simplicity, assume you have a tokenize function
input_ids = tokenize_for_mobile(test_message)  # Returns list of integers

# Run inference
interpreter.set_tensor(input_details[0]['index'], input_ids)
interpreter.invoke()
output = interpreter.get_tensor(output_details[0]['index'])

# Get prediction
phishing_score = output[0][1]  # Probability of phishing
print(f"Phishing score: {phishing_score:.2%}")

if phishing_score > 0.5:
    print("⚠️ PHISHING DETECTED!")
else:
    print("✅ Message appears legitimate")
```

---

## Phase 6: Integration with Mobile App (Day 5)

### What You Deliver to Your Mobile Dev Partner

**📦 Package Contents:**
```
ai_model_package/
├── phishing_detector.tflite    (42 MB)
├── vocab.txt                     (500 KB)
├── integration_guide.md          (instructions)
└── test_messages.json            (sample messages for testing)
```

### Integration Guide for Mobile Dev

```markdown
# Model Integration Guide

## Files Included
- `phishing_detector.tflite` - The AI model
- `vocab.txt` - Tokenizer vocabulary

## Where to Put Them
```
your-expo-app/
├── assets/
│   └── ai/
│       ├── phishing_detector.tflite
│       └── vocab.txt
```

## Usage in React Native

### Option A: Using TensorFlow.js (Easier)

```javascript
import * as tf from '@tensorflow/tfjs';
import { bundleResourceIO } from '@tensorflow/tfjs-react-native';

// Load model
const model = await tf.loadLayersModel(
  bundleResourceIO(require('./assets/ai/phishing_detector.tflite'))
);

// Analyze message
async function analyzeMessage(text) {
  // Tokenize text (implement based on vocab.txt)
  const tokens = tokenizeText(text);
  
  // Convert to tensor
  const inputTensor = tf.tensor2d([tokens], [1, 128]);
  
  // Run prediction
  const prediction = await model.predict(inputTensor);
  const score = (await prediction.data())[1];
  
  return score; // Returns probability 0-1
}

// Use in background service
const message = "URGENT: Click this link...";
const phishingScore = await analyzeMessage(message);

if (phishingScore > 0.7) {
  // Trigger alert notification
  sendPhishingAlert(message, phishingScore);
}
```

### Option B: Native Module (Faster, More Complex)

If TF.js is too slow, create a native Android module:

```kotlin
// android/app/src/main/java/PhishingDetector.kt
class PhishingDetector(context: Context) {
    private val interpreter: Interpreter
    
    init {
        val model = loadModelFile(context, "phishing_detector.tflite")
        interpreter = Interpreter(model)
    }
    
    fun analyzeMessage(text: String): Float {
        // Tokenize
        val tokens = tokenize(text)
        
        // Run inference
        val output = Array(1) { FloatArray(2) }
        interpreter.run(tokens, output)
        
        return output[0][1] // Phishing probability
    }
}
```

## Testing

Use these test messages to verify integration:

**Should DETECT as Phishing:**
- "URGENT: Your MTN account suspended. Click http://bit.ly/x123"
- "Congratulations! You won ₦500,000. Send ₦5,000 processing fee"

**Should be SAFE:**
- "Hi, how are you doing today?"
- "Meeting at 3pm tomorrow"

## Performance Targets
- Inference time: <100ms per message
- Memory usage: <50MB
- Battery impact: <2% per day
```

---

## 🤝 The Complete Integration Workflow

### Day 5: Integration Day

**Morning:**
1. **You:** Package the model + write integration guide
2. **You:** Send package to mobile dev partner
3. **Mobile Dev:** Review integration guide

**Afternoon:**
4. **Mobile Dev:** Integrate TFLite model into app
5. **Mobile Dev:** Replace mock detection with real model
6. **Together:** Test on actual devices with real phishing messages

**Evening:**
7. **Together:** Debug any issues
8. **Together:** Test battery usage, speed, accuracy

### Day 6-7: Polish & Demo Prep

- Fine-tune detection threshold (maybe 0.7 instead of 0.5?)
- Test with all target languages
- Prepare demo messages that showcase detection
- Record demo video

---

## 📊 Success Metrics Checklist

Before integration, verify:

- [ ] Model accuracy >95% on test set
- [ ] TFLite file size <50MB
- [ ] Inference time <100ms on mid-range Android
- [ ] Works offline (no internet needed)
- [ ] Detects phishing in all 9 languages
- [ ] False positive rate <2%
- [ ] Battery usage <5% per day

---

## 🚨 Common Issues & Solutions

### Issue 1: Model too large
**Solution:** Use quantization
```python
converter.optimizations = [tf.lite.Optimize.DEFAULT]
converter.target_spec.supported_types = [tf.int8]  # 8-bit instead of 16-bit
```

### Issue 2: Low accuracy on specific language
**Solution:** Add more training data for that language, or train language-specific models

### Issue 3: Slow inference
**Solution:** Reduce `max_length` from 128 to 64 tokens, or use MobileBERT instead

### Issue 4: Can't convert to TFLite
**Solution:** Use ONNX as intermediate format:
```bash
python -m tf2onnx.convert --saved-model ./tf_model --output model.onnx
```

---

## 📱 Demo Strategy

### For Judges/Presentation

**Live Demo Flow:**
1. Show app dashboard - clean, simple UI
2. Send a test phishing SMS to demo phone
3. App immediately shows alert notification
4. Open app → see detailed threat analysis
5. Show it works offline (turn off wifi/data)
6. Show it works in multiple languages

**Backup Plan:**
- Record demo video beforehand
- Have test messages ready to manually trigger
- Screenshot all detection results

---

## 🎯 Timeline Summary

| Day | You (AI/Data) | Mobile Dev Partner |
|-----|---------------|-------------------|
| 1 | ✅ Data collection | ✅ App skeleton + UI |
| 2 | 🔥 Model training | ✅ Background service |
| 3 | 🔥 Training + optimization | ✅ Mock detection working |
| 4 | 📦 TFLite conversion | ⏸️ Waiting for model |
| 5 | 🤝 Integration support | 🔄 Model integration |
| 6 | 🎨 Fine-tuning | ✨ Polish + testing |
| 7 | 🎬 Demo prep | 🎬 Demo prep |
| 8 | 🚀 Submission | 🚀 Submission |

---

## 💡 Pro Tips

1. **Start training TONIGHT** - Don't wait for perfect data
2. **Use Google Colab** - Free GPU for faster training
3. **Test on real device early** - Don't wait until Day 7
4. **Keep a training log** - Document accuracy improvements
5. **Have a Plan B** - If DistilBERT is too large, fall back to TF-IDF

**You've got this! The hardest part (data collection) is almost done. Training is just running code. 🚀**