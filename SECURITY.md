# Security

Please do not open a public issue for a vulnerability. Report it privately through GitHub: **Security** tab of this repository, **Report a vulnerability**. You will get an answer, and credit if you want it, once it is fixed.

Areas that matter most: the risk judge and approvals (`packages/server/src/engine/policy.js`), the secret vault (`packages/server/src/vault.js`), prompt-injection handling of tool output, and the sandbox the subscription transport runs in (`packages/server/src/engine/subscription/`).
