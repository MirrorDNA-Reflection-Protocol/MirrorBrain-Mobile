# ⟡ MirrorBrain Mobile

**Sovereign AI on your phone.** Local LLM inference using llama.rn.

## Features
- 🧠 Local inference via llama.rn (llama.cpp React Native bindings)
- 📱 Works offline — no cloud required
- 🔒 Private — your data stays on device
- ⚡ Fast — optimized for mobile hardware

## Quick Start

```bash
# Install dependencies
npm install

# Run on Android (Pixel connected via USB)
npx react-native run-android

# Run on iOS
cd ios && pod install && cd ..
npx react-native run-ios
```

## Requirements
- Node.js 18+
- React Native CLI
- Android Studio (for Android)
- Xcode (for iOS)
- Java 17 (configured in `android/gradle.properties`)

## Model
The app downloads and runs [TinyLlama](https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF) or similar quantized models locally.

## Project Structure
```
src/
├── screens/        # App screens (Chat, Settings)
├── services/       # LLM service, Kiwix service
├── components/     # UI components
└── utils/          # Helpers
```

## Part of MirrorDNA
This is the mobile component of the MirrorDNA Sovereign Stack:
- **MirrorBrain-Setup** — Mac Mini (desktop)
- **MirrorBrain-Mobile** — Android/iOS (this repo)
- **Mirror Intelligence** — Web (brief.activemirror.ai)
