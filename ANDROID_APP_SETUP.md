# Netaji Social & Welfare Trust — Android app setup

The Android app uses native Android screens. Contestants answer questions inside the app; it does not send them to the public website. It connects to the existing Firebase project and reads/writes the same quiz documents used by the Netaji Club Quiz website. The existing website login and Admin portal are not changed by the native app module.

## One-time Firebase / Google setup

1. In Firebase Console, open the existing netaji-club project. Do not create a new Firebase project.
2. Add an Android app with package name org.netajiclub.trust.
3. In Google Cloud Console / Firebase Authentication, use the Web OAuth client ID associated with the existing Google sign-in provider. Put that client ID in android-app/app/src/main/res/values/strings.xml, replacing REPLACE_WITH_WEB_CLIENT_ID.apps.googleusercontent.com.
4. Add the SHA-1 fingerprint shown in the GitHub Actions artifact file debug-signing-certificate.txt to the Android app fingerprints in Firebase project settings. GitHub-hosted runners can generate a different debug keystore on a fresh build, so this is for initial testing. For a stable production APK, create a private release keystore, keep it outside the public repository, and sign all release APKs with that same key.
5. Ensure Google is enabled under Firebase Authentication → Sign-in method.
6. Publish the additional Firestore rules in firestore.rules. Do not replace the current rules with permissive public write rules.

## Shared competition data

The app uses the existing structures:
- quizzes/{CODE} — status, current question, settings, timer and run ID.
- quizzes/{CODE}/questions/{INDEX} — current question and visible options.
- quizzes/{CODE}/keys/{INDEX} — protected answer key, read only after the player submits.
- quizzes/{CODE}/players/{UID} — participant registration, using the Firebase Auth UID.
- quizzes/{CODE}/answers/{UID}_{INDEX} — one answer per player/question.

Therefore, the current web Admin Start / Next / End actions and Android participant state use the same live quiz. The app has a native login flow using Google Sign-In → Firebase Auth with the same Google provider; the website's existing login code is not changed.

## Trust notices and content

The app reads public content from trustNotices, trustEvents, trustActivities, and trustInfo/contact. The additional rules allow public reads and restrict writes to the existing approved Admins. Create documents through the Trust Content Admin page. Suggested document fields:
- Notice: title, body, category, publishedAt (Firestore timestamp), pinned (boolean), status (published).
- Event: title, description, dateText, location, category, publishedAt (Firestore timestamp), status (published).
- Activity: title, description, category, imageUrl (optional HTTPS URL), publishedAt (Firestore timestamp), status (published).
- Contact document: trustInfo/contact, fields phone, email, address, upiId, about, mission as strings.

The rules file is maintained in this repository; commits do not publish them to Firebase automatically. Review and publish them manually in Firebase Console → Firestore Database → Rules.
