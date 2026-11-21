# Heyroq username rollout

The username registry uses the same named Firestore database as the app. Existing usernames remain visible. Legacy case variants reserve the same normalized username. If multiple existing profiles share a normalized username, the registry blocks new claims of that handle and leaves the existing profiles and their names intact. Each owner can choose another available username.

1. Verify the frontend candidate and Rules emulator tests for the same revision. Run `node scripts/bootstrap-username-registry.mjs` with `GOOGLE_CLOUD_PROJECT=rainbyte-studio` and approved credentials to count existing handles and legacy collisions. This command is read-only.
2. During the frontend cutover, deploy the reviewed Firestore Rules to the named database. Confirm a legacy client cannot create a profile or change a username without the registry. The absent `usernameRegistryState/v1` marker temporarily gates new profile creation and username changes. Existing profile sign-in and other profile edits remain available.
3. While profile creation and username changes are gated, run `node scripts/bootstrap-username-registry.mjs --apply --confirm-frozen-profile-writes` from the same revision. The script creates the ready marker only after reserving existing handles. If it stops, inspect the conflict and keep the gate closed. Profile reads use the new data only after activation.
4. Publish the tested frontend. Verify email signup, first-time Google profile setup, a rejected duplicate, and a successful rename with a disposable account. Existing users keep their current username until they edit it.

Keep the registry-enforcing Rules after activation. If the frontend needs to be rolled back, use a version that still writes profile and reservation atomically. Changing the rules to allow older create or rename paths can reintroduce duplicates.
