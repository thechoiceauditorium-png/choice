# Brevo SMTP & Password Reset Configuration Guide
**The Choice Auditorium Operations Platform**

---

## 1. Password Hashing & Cryptographic Security Architecture

You asked: *"hash all the passwords ok i dont wanna compramize on any sequrity"*.

Here is how password security and hashing are strictly guaranteed:

1. **Server-Side Cryptographic Hashing (Zero Compromise)**:
   - Passwords are **NEVER** stored in plaintext anywhere.
   - Passwords are encrypted in-transit over HTTPS (TLS 1.3).
   - Upon arriving at the Supabase Auth server (GoTrue engine), the raw password is automatically salted and hashed using **bcrypt** (cost factor 10) or **Argon2id**.
   - Only the cryptographically salted hash is stored in PostgreSQL internal `auth.users.encrypted_password`.
   - Neither developers, administrators, nor database queries can reverse this hash to read raw passwords.

2. **No Application DB Storage**:
   - The application table `team_users` contains **no password column**.
   - No passwords are ever stored in `localStorage`, `sessionStorage`, cookies, or client cache.

3. **Role Escalation Protection**:
   - Public registrations via `signUp()` cannot assign themselves privileges.
   - The dashboard requires `auth.jwt() -> app_metadata.role` (`owner` or `worker`).
   - Newly signed up users remain locked out of operational data until an owner executes SQL to grant their role.

---

## 2. Configuring Brevo SMTP in Supabase

To have password reset OTP codes and confirmation emails sent through Brevo:

### Step 1: Obtain Brevo SMTP Credentials
1. Log in to [Brevo (formerly Sendinblue)](https://app.brevo.com).
2. Go to your **Profile / Account Name** (top right) $\rightarrow$ **SMTP & API**.
3. Under the **SMTP** tab:
   - **SMTP Server**: `smtp-relay.brevo.com`
   - **Port**: `587`
   - **Login**: Your Brevo SMTP login email
   - Click **Generate a new SMTP key** $\rightarrow$ copy the generated master password.
4. Ensure your sender email address (e.g., `admin@thechoiceauditorium.com` or your verified domain/email) is verified in Brevo under **Senders & IP**.

---

### Step 2: Configure Supabase Custom SMTP
1. Log in to the [Supabase Dashboard](https://supabase.com/dashboard) and open project `kaxcbzdogwrfbndsnqff`.
2. In the left navigation, click **Project Settings** (gear icon) $\rightarrow$ **Authentication**.
3. Scroll down to **SMTP Settings** and toggle **Enable Custom SMTP**: **ON**.
4. Fill in the fields:
   - **Sender email**: Your verified Brevo sender address (e.g. `notifications@thechoiceauditorium.com` or your verified email).
   - **Sender name**: `The Choice Auditorium`
   - **Host**: `smtp-relay.brevo.com`
   - **Port**: `587`
   - **Minimum TLS Version**: `1.2`
   - **User**: Your Brevo SMTP Login email.
   - **Password**: Your generated Brevo SMTP Master Key.
5. Click **Save Changes**.

---

### Step 3: Configure 6-Digit Email OTP Template in Supabase
To ensure users receive a 6-digit OTP code rather than a redirect link:

1. In Supabase Dashboard, go to **Authentication** $\rightarrow$ **Email Templates**.
2. Click on the **Reset Password** template.
3. Edit the subject:
   ```text
   Your Choice Auditorium Password Reset Code: {{ .Token }}
   ```
4. In the email body, use the OTP token variable `{{ .Token }}`:
   ```html
   <h2>The Choice Auditorium</h2>
   <p>You requested a password reset for your account.</p>
   <p>Your 6-digit recovery verification code is:</p>
   <h1 style="letter-spacing: 5px; font-size: 32px; color: #9E1B22;">{{ .Token }}</h1>
   <p>Enter this code in the password reset form along with your new password.</p>
   <p>This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
   ```
5. Click **Save**.

---

## 3. How the OTP Reset Flow Works in the UI

1. User opens `index.html` $\rightarrow$ clicks **Forgot Password** tab.
2. User enters their registered email and clicks **Send Recovery OTP**.
3. JavaScript calls `supabase.auth.resetPasswordForEmail(email)`.
4. Supabase generates a 6-digit OTP token and sends the email via Brevo relay.
5. Form switches to Step 2: User inputs the 6-digit code and their new password (min 8 chars).
6. JavaScript calls:
   ```javascript
   await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
   await supabase.auth.updateUser({ password: newPassword });
   ```
7. Password is updated and hashed with bcrypt on Supabase server. User is redirected to `dashboard.html`.

---

## 4. How Newly Registered Users are Promoted

When an employee signs up on `index.html` using the **Sign Up** tab:

1. They create an account with email and password.
2. Their account is created in `auth.users`, but has no `app_metadata.role`.
3. To grant access, the administrator runs this query in Supabase SQL Editor:
   ```sql
   -- Find user id:
   SELECT id, email FROM auth.users WHERE email = 'newstaff@choiceauditorium.com';

   -- Grant 'worker' or 'owner' role:
   UPDATE auth.users
   SET raw_app_meta_data = raw_app_meta_data || '{"role": "worker"}'::jsonb
   WHERE email = 'newstaff@choiceauditorium.com';
   ```
4. This ensures no unvetted public registration can view bookings, ledger entries, or attendance records.
