# Firebase setup — required before real multi-device quizzes

This repository currently provides a browser-only prototype. The Admin and player pages use localStorage, so they can only share state in the same browser profile/device and same origin. It is not suitable for a real public competition across separate phones.

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
- Current pages do not yet use the Firebase configuration. Do not assume that Firebase has been connected just because the config file exists.

## Current feature status
- Quiz Code generation: implemented in browser prototype.
- Add questions: browser prototype only.
- Automatic question advance every 10 seconds: browser prototype only.
- Cross-device synchronization: not implemented yet.
- Server-validated answers/scoring and secure admin authorization: not implemented in the frontend yet.
