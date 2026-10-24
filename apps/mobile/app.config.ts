import type { ExpoConfig } from 'expo/config';

/**
 * Values that differ per owner come from environment variables at build time:
 *   IOS_BUNDLE_ID       — your reverse-DNS bundle id (must match your Apple Developer App ID)
 *   EAS_PROJECT_ID      — from `eas init`; required for Expo push tokens
 *   EXPO_PUBLIC_API_URL — public HTTPS URL of the Friday API (not a secret)
 */
const config: ExpoConfig = {
  name: 'Friday',
  slug: 'friday-assistant',
  scheme: 'friday',
  version: '0.1.0',
  orientation: 'default',
  userInterfaceStyle: 'dark',
  backgroundColor: '#060505',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: process.env.IOS_BUNDLE_ID ?? 'com.example.friday',
    supportsTablet: true,
    infoPlist: {
      NSMicrophoneUsageDescription: 'Friday uses the microphone only while you hold or tap the mic button to dictate a message.',
      NSSpeechRecognitionUsageDescription: 'Friday converts your voice to text so you can review it before sending.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    ['expo-notifications', { color: '#D63229' }],
    [
      'expo-speech-recognition',
      {
        microphonePermission: 'Friday uses the microphone only while you tap the mic button to dictate a message.',
        speechRecognitionPermission: 'Friday converts your voice to text so you can review it before sending.',
      },
    ],
    ['expo-splash-screen', { backgroundColor: '#060505', image: './assets/icon.png', imageWidth: 120 }],
  ],
  experiments: { typedRoutes: false },
  extra: {
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
};

export default config;
