### **Afrihackbox AI Phishing Shield: Mobile Application Technical Specification**

**Document Version:** 1.0
**Date:** October 7, 2025
**Technology Stack:** React Native (Expo)

#### **1. Vision & Core Principles**

The application will be a lightweight, privacy-focused security utility for Android users. It will operate silently in the background, providing immediate, easy-to-understand alerts about potential phishing threats in SMS and other messaging platforms.

- **Simplicity First:** The user interface will be minimal and intuitive, designed for users with low technical literacy.
- **Offline-First:** All core detection functionality must work perfectly without an internet connection.
- **Privacy-Centric:** All message analysis will happen exclusively on the device. No message content will ever be sent to a server.
- **Battery Efficiency:** The app must have a negligible impact on the device's battery life.

#### **2. Architecture & Key Libraries**

We will use the **Expo Managed Workflow (SDK 54+)** for maximum compatibility and ease of development. Expo's modern SDK provides native modules for most of our requirements. We will only consider a custom development client if TFLite integration absolutely requires it.

- **Framework:** React Native (via Expo SDK 54)
- **On-Device AI:** **TensorFlow Lite (TFLite)** - We'll explore:
  1. `@tensorflow/tfjs-react-native` for JavaScript-based inference (lightweight, no native code)
  2. `react-native-tensorflow-lite` with Expo config plugin if native performance is critical
- **Background Processing:** **`expo-task-manager`** + **`expo-background-fetch`** - Built-in Expo APIs for efficient background tasks
- **Notifications:** **`expo-notifications`** - Handles local push notifications natively
- **SMS Access:** **`expo-sms`** for basic SMS reading (Android only)
- **Localization:** **`expo-localization`** + **`i18next`** with **`react-i18next`**. Translation files (`.json`) for English, French, Swahili, and other required languages.
- **UI/Components:** React Native built-in components + **NativeWind (TailwindCSS)** for styling (already configured)
- **Navigation:** **`expo-router`** (file-based routing) or **React Navigation**
- **Permissions:** `expo-permissions`, `expo-notifications`, and potentially Android's Notification Listener Service for WhatsApp message scanning

#### **3. Core Features & User Journey**

**A. Onboarding & Permissions**

- **User Journey:** First-time user opens the app.
  1.  A simple, multi-screen welcome carousel explains _what_ the app does and _why_ it needs specific permissions (in their chosen language).
  2.  Screen 1: "Welcome to Phishing Shield."
  3.  Screen 2: "We protect you by reading messages _only on your phone_." (Privacy guarantee).
  4.  Screen 3: "To work, we need permission to read notifications."
  5.  The app requests the necessary permissions (Notification Access, SMS Read). The user must grant these for the app to function.
- **Technical Implementation:** Use the `PermissionsAndroid` API for SMS and an Intent to open the Notification Access settings screen.

**B. The Dashboard (Main Screen)**

- **User Journey:** User opens the app after setup.
- **UI Elements:**
  - **Status Indicator:** A large, clear visual element (e.g., a green shield icon) with text like "You are protected."
  - **Statistics:** Simple, easy-to-read stats: "Messages scanned today: 42", "Threats found this week: 1". This builds trust and shows the app is working.
  - **Recent Alerts:** A list of the last 1-2 alerts, allowing the user to view details.
  - **A "Report a Message" Button:** A simple way for users to manually submit a suspicious message, which can help improve the model over time (this data would be anonymized).

**C. Background Detection Service**

- **This is the core of the app.** It is not visible to the user.
- **Technical Implementation:**
  1.  A headless JS task is registered using `react-native-background-fetch`.
  2.  This task runs in two scenarios:
      - Upon receiving a new SMS (using `react-native-sms-retriever` or similar).
      - Periodically (e.g., every 15 minutes) to analyze new notifications captured by the Accessibility Service (for WhatsApp, etc.).
  3.  When the task runs, it retrieves the message text.
  4.  It passes the text to the TFLite native module.
  5.  The module returns a score (e.g., 0.95 for phishing).
  6.  If the score exceeds a threshold, the app triggers a local push notification.

**D. The Alert System**

- **User Journey:** A phishing message is detected.
- **Implementation:**
  1.  The background service triggers a **Local Push Notification** using `expo-notifications`.
  2.  The notification is clear and actionable: **"⚠️ Phishing Alert! The last message you received looks suspicious. Tap to see why."**
  3.  Tapping the notification opens a modal screen in the app that displays the malicious message and explains the risk in simple terms (e.g., "This message is trying to steal your information by asking for personal details.").
  4.  The alert screen will have clear action buttons: "Delete Message" and "Ignore".

#### **4. How This Design Meets All Hackathon Requirements**

- **Detection Accuracy (95%+):** Handled by the AI model, but the app provides the infrastructure to run it.
- **Language Support (Multi-lingual):** `i18next` ensures the entire UI is localized. The app passes text to the model, which handles the multilingual detection.
- **Device Compatibility (1-2GB RAM):** The React Native app will be kept lean. The TFLite model is specifically designed for low-memory devices. We will avoid heavy animations or complex state management.
- **Offline Operation (72+ hours):** The entire detection flow is on-device. The background service, the TFLite model, and local notifications require **zero internet connectivity**.
- **Battery Efficiency (<5% per day):** We will use `react-native-background-fetch` which is an OS-aware scheduler. It runs tasks opportunistically rather than keeping a constant, power-draining service open.
- **Real-time Processing (No delay):** On-device processing is instantaneous. The moment a message is received and the background task runs, the analysis is performed in milliseconds.

#### **5. Phase-by-Phase Development Plan**

**Phase 1: The App Skeleton & UI (1-2 Days)**

- **Goal:** Create a visible, clickable app shell.
- **Tasks:**
  - Set up the Expo project (managed workflow - already done ✓).
  - Install core dependencies: `expo-router`, `i18next`, `react-i18next`, `expo-localization`.
  - Build the main screens: Onboarding, Dashboard, Settings.
  - Implement navigation with `expo-router` or React Navigation.
  - Set up `i18next` with placeholder translation files for English and French. All UI text must use the translation function (`t('key')`) from the start.

**Phase 2: Background Service & Mock Detection (2-3 Days)**

- **Goal:** Get the core background logic working without the real AI.
- **Tasks:**
  - Integrate `react-native-background-fetch`.
  - Set up the listeners for SMS/Notifications.
  - Create a **mock detection function** in JavaScript. (e.g., `if (message.includes('winner')) return 0.99;`).
  - Implement the local push notification system. When the mock function detects a "threat," a notification appears.

**Phase 3: TFLite Model Integration (The Core Challenge) (3-4 Days)**

- **Goal:** Connect the React Native app to the real AI model.
- **Tasks:**
  - Develop the native module (Android - Java/Kotlin) that exposes a single function to JavaScript: `analyzeMessage(text: string): Promise<number>`.
  - This native function will load and run the `.tflite` model file.
  - Replace the mock detection function from Phase 2 with a call to our new native module.
  - Thoroughly test the communication bridge between JS and the native layer.

**Phase 4: Polishing, Testing & Optimization (2 Days)**

- **Goal:** Prepare the app for submission.
- **Tasks:**
  - Test on actual low-spec Android devices (using the provided hardware).
  - Monitor battery and memory usage using Android Studio Profiler.
  - Refine the UI/UX based on feedback.
  - Complete all translations.

---

**Actionable Next Step:**

We can immediately begin **Phase 1**. We can set up the project and build the entire user interface with dummy data. This is a significant amount of work that can be done without waiting for the final AI model. We should focus on making the onboarding process clear and the dashboard visually reassuring.

---

### **So what if we want to build against Voice Phishing as well?**

### **The Core Technical Challenge: From Text to Audio**

The fundamental shift is that we are no longer dealing with simple strings of text. We are dealing with audio data. The AI pipeline for this is completely different and much more resource-intensive.

The key component we would need to add is a **Speech-to-Text (STT) engine**. This is a model that listens to audio and transcribes it into written words. Once the audio is converted to text, we can then feed it into the _exact same NLP phishing detection model_ we're building for SMS.

Let's analyze the two scenarios you mentioned.

#### **Scenario A: Real-Time Call Analysis ("Listen to calls maybe lol")**

This is the holy grail of vishing detection, but it is **extremely difficult and likely not feasible** on standard Android for several reasons:

1.  **OS Security Restrictions:** For massive security and privacy reasons, modern Android and iOS versions heavily restrict an app's ability to access live, in-call audio streams. A regular app cannot simply "tap into" a phone call. This capability is generally reserved for system-level applications or requires rooting the device, which is not a scalable solution.
2.  **Massive Performance Hit:** Even if it were possible, running a real-time STT engine during a phone call would be incredibly demanding on a basic smartphone's CPU. This would cause the phone to heat up and would absolutely **destroy the battery**, instantly violating the `<5% per day` requirement.
3.  **Privacy & User Trust:** The permission required for this ("record all your live phone calls") would be terrifying to most users. It's a huge barrier to adoption.

**Verdict for Hackathon:** Out of scope. The technical and privacy hurdles are too high.

---

#### **Scenario B: Post-Call Analysis of a Recording**

This is **much more technically feasible** and presents a realistic path forward for a future version of our app.

Here's how the user journey and technical workflow would look:

1.  **The Trigger:** The user has a suspicious phone call. Many Android phones have a built-in feature to record calls, or the user uses a third-party call recorder app.
2.  **User Action:** After the call, the user opens our "Phishing Shield" app and navigates to a new "Analyze Call Recording" feature.
3.  **File Access:** The app requests permission to access the device's storage (`READ_EXTERNAL_STORAGE`) and the user selects the audio file of the recorded call.
4.  **On-Device Transcription:**
    - This is the new, critical step. We would need to integrate a lightweight, **offline STT engine** into our app. A great candidate for this would be the **Vosk API**, which is open-source and designed to work completely offline on mobile devices.
    - The app would process the audio file in chunks, converting the speech into a block of text. This might take a few seconds to a minute, depending on the call length and the phone's processor.
5.  **Phishing Analysis:**
    - The resulting text transcript is then passed to our existing TFLite NLP model.
    - The model analyzes the text for the same scam patterns: urgency ("you must act now"), impersonation ("this is your bank"), social engineering ("we need to verify your PIN"), etc.
6.  **Displaying Results:** The app displays the transcript to the user, highlighting the sentences or phrases that were flagged as suspicious, along with an explanation of the potential threat.

**Challenges for This Approach:**

- **App Size:** STT models, even lightweight ones, are not small. This would increase our app's installation size significantly.
- **Processing Time:** It wouldn't be real-time. The analysis happens _after_ the potential damage is done, but it can serve as a powerful tool to confirm suspicions and educate the user for the future.
- **Language Support:** The STT model must also support the required languages (Swahili, Yoruba, etc.), which can be challenging to find for offline use.

---

### **Recommendation & Action Plan**

1.  **For the Hackathon (MVP): Focus and Win.** We must concentrate 100% of our efforts on building the best possible **text-based detection system (SMS, WhatsApp)**. This is the core requirement and is already a complex challenge.

2.  **For the Final Presentation (The Vision):** This is where your idea becomes our secret weapon. In the "Future Roadmap" section of our presentation, we will present a slide detailing our plan to combat Vishing.
    - **Phase 1 (Our Hackathon MVP):** Text-based protection.
    - **Phase 2 (Post-Hackathon):** Introduce **Post-Call Recording Analysis**. This demonstrates a clear, technically sound plan for expanding the app's capabilities.
    - **Phase 3 (Long-Term):** Research real-time analysis for **VoIP calls (WhatsApp, Telegram)**, as their APIs might be more open to this than cellular calls.

This shows the judges that we are not just solving the immediate problem but have a deep understanding of the entire phishing landscape and a credible plan to address it.

So, let's keep this brilliant idea in our back pocket. We'll design our NLP model's text-processing capabilities to be modular, so that in the future, it won't care if the text came from an SMS or a transcribed phone call.
