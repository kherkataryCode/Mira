# iOS app guide

The iOS app lives in `apps/mobile` (Expo SDK 58, Expo Router). It talks directly to the API over HTTPS with a bearer token stored in the iOS Keychain.

## 1. Run in development

```bash
cp apps/mobile/.env.example apps/mobile/.env
# EXPO_PUBLIC_API_URL: for a phone on your Wi-Fi use your computer's LAN IP, e.g. http://192.168.1.20:4000
npm run dev:mobile
```

Scan the QR code with **Expo Go** to try most features. Expo Go cannot load custom native modules, so **voice input shows “unavailable”** there (by design, never a fake success). Local notifications work in Expo Go; remote push does not.

> The app authenticates with bearer tokens, not cookies, so `WEB_ORIGINS` doesn't need to include anything for the phone.

## 2. Development build (for voice + push)

Requirements: an Apple Developer Program membership, and either a Mac with Xcode (`npx expo run:ios`) or EAS Build (`npm i -g eas-cli`).

```bash
cd apps/mobile
eas login
eas init                                   # creates the project; copy its id into EAS_PROJECT_ID
export IOS_BUNDLE_ID=com.yourname.friday   # must match an App ID in your Apple account
export EAS_PROJECT_ID=<from eas init>
eas build --profile development --platform ios   # or: npx expo run:ios on a Mac
```

EAS will offer to create signing certificates and provisioning profiles for you. Install the build on your iPhone, then run `npm run dev:mobile`.

## 3. Push notifications (APNs via Expo Push Service)

1. `eas credentials` → iOS → **Push Notifications** → let EAS create or upload an **APNs key (.p8)**. The key stays in your Expo account — never commit it.
2. On the server worker set `PUSH_ENABLED=true` (and `EXPO_ACCESS_TOKEN` if you enabled enhanced push security in Expo).
3. In the app: **More → Reminders → Allow notifications**. The app requests permission in context, then registers its Expo push token with `POST /devices`.
4. Create a reminder 2 minutes ahead and lock the phone. Check **Reminders** for the delivery status (`push sent`, or `skipped`/`failed` with a reason).

Test cases to run on a **physical iPhone** (the Simulator does not receive APNs pushes): foreground, background, permission denied (status shows *skipped/denied*, reminders still appear in-app), token refresh (reinstall), and sign-out (local schedules are cleared; the device can be removed in web Settings).

**Local notifications** are separate: the Reminders screen mirrors your next 50 active reminders on-device (iOS caps pending notifications at 64). They fire even offline, but only reflect what the app last synced.

## 4. TestFlight / App Store

```bash
eas build --profile production --platform ios
eas submit --platform ios
```

Set `EXPO_PUBLIC_API_URL` to your public HTTPS API (e.g. the `friday-api` Render URL) for production builds. App Store review requires a privacy policy URL and accurate data-use disclosures (Mira stores account data on your server and sends chat text to the AI providers you configure).

## 5. Orientation & accessibility

`orientation: "default"` — portrait and landscape are both supported; Home and Learn switch to two columns at ≥700 pt wide. Text respects Dynamic Type up to a cap, touch targets are ≥44 pt, and controls have VoiceOver labels.

## What could not be verified in the build environment

No macOS/Xcode or physical device was available. Verified: TypeScript, and a full Metro/Hermes iOS bundle via `expo export --platform ios`. Not verified: native compilation, signing, running on a device or Simulator, speech recognition, APNs delivery.
