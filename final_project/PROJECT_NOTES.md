# Resume Builder Final Project Notes

## E1 change list

| Requirement | File | Change and reason |
|---|---|---|
| E2 least-privilege IAM | `uploader-policy.json` | Allow only `s3:PutObject` under `resumes/*` and `ssm:GetParameter` for the one Gemini parameter. |
| E2 least-privilege IAM | `viewer-policy.json` | Allow only `s3:GetObject` under `resumes/*` and the three required SNS actions on the project topic. No `s3:ListBucket`. |
| E3a compressed user-data | `create_app_stack.sh` | Gzip each `app.js`, then base64-encode it; instances base64-decode and gunzip it. |
| E3b application settings | `create_app_stack.sh` | Pass `VIEWER_PORT`, `GEMINI_KEY_PARAM`, and `GEMINI_MODEL` to uploader; pass `SNS_TOPIC_ARN` to viewer. |
| E3c size validation | `create_app_stack.sh` | Print each generated user-data file's byte count and stop if it is 16,384 bytes or larger. |
| E4 one-day retention | `create_app_stack.sh` | Apply an S3 lifecycle rule that expires objects under `resumes/` after one day. |
| H cleanup | `cleanup_project.sh` | Delete the stack, SNS topic, and SSM parameter only when the whole project is finished. |

## IAM action-to-code mapping

| Role | Action | Resource | Code that requires it |
|---|---|---|---|
| Uploader | `s3:PutObject` | `arn:aws:s3:::itmo-444-544-jhan38-fileshare/resumes/*` | `PutObjectCommand` saves the validated JSON and generated DOCX. |
| Uploader | `ssm:GetParameter` | `arn:aws:ssm:us-east-2:541195182299:parameter/itmo-444/gemini-api-key` | `GetParameterCommand` reads the Gemini key with decryption. |
| Viewer | `s3:GetObject` | `arn:aws:s3:::itmo-444-544-jhan38-fileshare/resumes/*` | `GetObjectCommand` loads JSON and signs the DOCX download. |
| Viewer | `sns:ListSubscriptionsByTopic` | `arn:aws:sns:us-east-2:541195182299:resume-mailer-jhan38` | Finds whether the requested address is subscribed and confirmed. |
| Viewer | `sns:Subscribe` | Same topic | Creates an email subscription with a recipient filter policy. |
| Viewer | `sns:Publish` | Same topic | Sends the one-hour DOCX link with the matching `recipient` attribute. |

## Short answers

1. SNS email cannot attach the DOCX. The viewer generates a time-limited pre-signed S3 URL and publishes that URL in the message. Anyone who obtains the URL can download the object until it expires, so the emailed link lasts only one hour and the object key contains a random 128-bit ID.

2. Every subscription has a filter policy for its lowercase email address, and every published message has a matching `recipient` string attribute. Without the policy, SNS would deliver every resume link to every confirmed subscriber on the shared topic, exposing one user's resume to other users.

3. The application stores JSON and DOCX results in S3 because EC2 instances in an Auto Scaling Group are replaceable. State kept only in an uploader process or its local disk would disappear with that instance and would not be available to a different viewer instance. S3 provides shared durable state to both tiers.

4. The Gemini key is an encrypted SSM SecureString rather than user-data because launch-template user-data is retrievable by principals that can describe the template and is also present on the instance. Only the uploader role receives permission to decrypt the one parameter; the viewer role and unrelated roles do not.

5. The prompt reduces the chance that Gemini invents facts or follows hostile text, but a model cannot guarantee compliance or valid output. `parseResume` independently enforces the JSON shape and length limits and removes proposed keywords that do not actually occur in the job description.

6. A nonexistent resume ID produces a generic "does not exist or has expired" page. The viewer treats S3 `AccessDenied` like a missing object because it intentionally lacks `s3:ListBucket`; granting list access would let a compromised viewer enumerate every resume key.

7. A visitor could exhaust Gemini quota by repeatedly generating resumes; the code limits requests per IP and globally, while a production deployment could add AWS WAF rate-based rules or authentication. A visitor could also trigger confirmation emails to strangers; the viewer limits email requests per IP, while a production deployment could require verified accounts and restrict the ALB to authenticated users.

## Local verification

- Uploader: 13 tests passed.
- Viewer: 13 tests passed.
- Uncompressed source sizes: uploader 14,484 bytes; viewer 9,492 bytes.
- Estimated generated user-data sizes before deployment: uploader about 9,000 bytes; viewer about 6,576 bytes. The deployment script prints and enforces the exact values.

## Remaining live evidence

The following must be collected during deployment because it depends on the user's Gemini key, inbox confirmations, and screenshots: SSM SecureString listing, SNS confirmation before/after, exact user-data byte counts, target health, live tests F1-F12, deliberate failure tests, resilience replacement test, and final cleanup listings.
