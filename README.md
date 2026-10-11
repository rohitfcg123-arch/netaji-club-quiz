# Netaji Club — Saraswati Puja Quiz

Admin portal: `admin.html`  
Player portal: `index.html`

## Status
This repository is being initialized from the provided project ZIP. The current browser-only quiz prototype uses `localStorage`, so it does not synchronize across different phones. Firebase is not yet configured for the new Firebase account, and Cloud Functions must be deployed before real multi-device live play is enabled.

## Setup required
1. Configure `js/firebase.js` with the new Firebase web app configuration.
2. Enable Firebase Authentication and create the admin user.
3. Create `admins/{UID}` in Firestore with `{ "active": true }` using a trusted admin process.
4. Review and deploy Firestore rules and Cloud Functions only after the frontend is wired to those functions.

Do not place service-account private keys in this repository.