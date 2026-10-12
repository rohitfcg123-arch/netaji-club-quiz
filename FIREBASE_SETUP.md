# Firebase setup — required before real multi-device quizzes

The app uses Firebase Authentication and Cloud Firestore for Admin authorization, quiz metadata, questions, player answers and realtime quiz state. localStorage is used as a convenience cache, not as the cross-device source of truth. Before using it across devices, make sure Firebase config is correct, the current Firestore Rules are published, and the Admin UID is allowlisted.

## Configure your own Firebase project
1. Sign in to Firebase Console with the Google account you want to own the project.
2. Create a Firebase project and register a Web App.
3. Copy the web app configuration into js/firebase.js.
4. Enable Firebase Authentication and choose the intended sign-in method.
5. Create Firestore and deploy reviewed Security Rules.
6. Deploy Cloud Functions from the functions directory only after the UI calls are implemented and tested.
7. Provision admin users through a trusted process. Never let public clients write their own admins/{uid} privilege document.

## Security
- Never commit service-account JSON files, private keys, or deployment tokens.
- A web API key is not a secret, but it does not provide authorization. Authentication and Firestore/Functions authorization must enforce access.
- The current pages import the Firebase Web App configuration in `js/firebase.js`. A repository commit alone does not publish Firestore Rules or configure Authentication providers.

## Current feature status
- Quiz Code generation: implemented in browser prototype.
- Add questions: browser prototype only.
- Automatic question advance every 10 seconds: browser prototype only.
- Cross-device synchronization: implemented through Firestore real-time listeners for the live quiz and branding settings.
- Server-validated answers/scoring and secure admin authorization: not implemented in the frontend yet.


## Live quiz sync (added 12 Oct 2026)
The Admin and Player pages now use Cloud Firestore for quiz metadata and question documents:
- `quizzes/{CODE}`: quiz status, current question index, settings and timer timestamps.
- `quizzes/{CODE}/questions/{INDEX}`: question text/options, without the answer key.
- `quizzes/{CODE}/keys/{INDEX}`: answer key, admin-only.

### Required: publish Firestore Rules
GitHub commits do NOT publish rules to Firebase automatically. In Firebase Console → Firestore Database → Rules, replace the current rules with the contents of `firestore.rules` in this repository and click **Publish**. The existing `admins/{UID}` document must have Boolean `active: true` for the admin account.

The live quiz uses Firestore (database), not Firebase Storage (file storage). Do not put live quiz state or answer keys in a publicly readable document. The current client-side version supports live quiz/question display; secure answer submission and server-side scoring still require a trusted backend/Cloud Function.

## Theme Studio & custom branding (13 Oct 2026)
The Admin Dashboard now links to `theme-studio.html`. It can save either a default branding preset for new quizzes or a per-quiz override:
- `siteSettings/branding`: default preset, palette, configurable headings/copy, external logo/background image URLs, and effects.
- `quizzes/{CODE}.settings.branding`: optional override for one quiz; the quiz's display name is saved to `quizzes/{CODE}.name`.
- `js/branding.js`: shared theme resolver and live subscription used by the landing page, participant page, projector view, and winners screen.

### Required Rules update for Theme Studio
The `firestore.rules` file includes a least-privilege `siteSettings/branding` rule: anyone can read only that one branding document, while writes require the existing password-provider Admin allowlist (`admins/{UID}.active == true`). Other `siteSettings` documents remain denied. Since this repository deploys GitHub Pages rather than Firestore Rules, publish the current repository's `firestore.rules` manually in Firebase Console → Firestore Database → Rules → Publish before using Theme Studio. Do not loosen the existing quiz/player/answer rules.

The logo and background fields currently accept public HTTP(S) image URLs; they do not upload files to Firebase Storage. If a save reports `permission-denied`, confirm that the latest rules were published and that the session is an active Admin account.
