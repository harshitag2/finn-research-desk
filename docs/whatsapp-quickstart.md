# Connect WhatsApp to FINN

FINN's integration code does not create a Meta account or sender. Until the owner finishes the setup below, the app correctly shows automatic delivery as not connected. No recipient number or live provider credentials were configured by this repair.

## 1. Get a test message working in Meta

1. Open https://developers.facebook.com/apps/ and sign in to your Meta account.
2. Create an app using the WhatsApp use case, with a Meta business portfolio as required by the dashboard.
3. Open the WhatsApp API Setup / API Testing page. Use the test sender supplied by Meta.
4. Add your own WhatsApp number as a recipient and complete its verification.
5. Use the dashboard's `hello_world` test message. Confirm it reaches your phone before connecting FINN.

Meta's account, phone, business, access and template requirements vary between development tests and production. Follow the requirements shown in the account dashboard; a working test sender is not production approval. See [Meta's official Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).

## 2. Connect FINN's test button

In the Vercel project's production environment settings, add these server variables, then redeploy:

| Variable | Value |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Sender token from Meta; temporary test tokens expire. |
| `WHATSAPP_PHONE_NUMBER_ID` | The sender's Phone Number ID, not its phone number or Business Account ID. |
| `WHATSAPP_GRAPH_VERSION` | The supported `vN.N` version displayed in Meta's request example. |
| `WHATSAPP_TEMPLATE_NAME` | `hello_world` for the initial test. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | `en_US` for the Meta sample. |

Do not commit tokens, put them in the browser, or paste them into chat. Open FINN → Inbox → WhatsApp, save your verified recipient, explicitly opt in and enable the preference, then press **Send a connection test**. FINN sends the sample template without body parameters. A successful API response is recorded as accepted; it does not establish delivery.

## 3. Enable real alerts

Configure a production-capable sender and an approved utility template with one body text parameter, `{{1}}`, and update the template name/language in Vercel. Use credentials suitable for continued operation, following Meta's permissions and token policies.

Set `WHATSAPP_APP_SECRET` to the Meta app secret and `WHATSAPP_VERIFY_TOKEN` to a private random value of your choice. In Meta's webhook configuration, enter:

`https://finn-research-desk.vercel.app/api/whatsapp/webhook`

Enter the same verify token and subscribe the app to `messages` for receipts and incoming STOP handling. Complete Meta's webhook verification and test callbacks. Vercel handles the challenge directly, and POST callbacks require a valid HMAC signature. This route is independent of the website's visitor sign-in gate. No Sites relay is needed for this Vercel endpoint.

Redeploy after environment changes. The app distinguishes disconnected, test-only, callbacks-required, ready-to-send and paused states. Automatic dispatch waits for a non-sample template and callback credentials. Saving an enabled preference also syncs the current watchlist and enables its monitoring profile; pausing WhatsApp leaves website monitoring intact. Urgent updates go on the next successful scan. Regular updates follow the chosen hourly/daily/weekly cadence. Delivery receipts update accepted → sent → delivered → read, or failed.

For this public prototype, the recipient belongs to the signed browser profile. Clearing cookies loses that anonymous identity. A number already connected to another profile must not be claimed by a new visitor. Account-based recovery/phone ownership verification is future work; this is not a general-purpose public messaging SaaS.
