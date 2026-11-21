# Real Alpha Shylock Loan — Supabase connected starter

## Files
- `index.html` — original website structure, updated for Supabase.
- `styles.css` — extracted original styling.
- `supabase-config.js` — your project URL and publishable key.
- `app.js` — Supabase Auth, application submission, private document uploads, customer history and staff dashboard.
- `supabase-schema.sql` — database tables, Row Level Security and private storage policies.

## 1. Create the database and private storage
1. Open the Supabase project: https://supabase.com/dashboard/project/khnmixyqiyiwjtyxlump
2. Open **SQL Editor**.
3. Paste all of `supabase-schema.sql` and run it.
4. In **Storage**, confirm that the `loan-documents` bucket exists and is marked **Private**.

## 2. Configure authentication
1. In Supabase, open **Authentication → URL Configuration**.
2. Set the Site URL to your deployed website URL (for local testing use `http://localhost:5500`).
3. Add your deployed website and local testing URL to the Redirect URLs.
4. Email confirmation may be enabled. If it is, a new customer must confirm their email before signing in.

## 3. Make the first staff account
1. Register your own account using the website's Portal.
2. In Supabase open **Authentication → Users** and copy that user's UUID.
3. In **SQL Editor**, run this command after replacing the UUID:
   `insert into public.user_roles (user_id, role) values ('PASTE-USER-UUID-HERE', 'admin');`
4. Sign out and sign back in. The staff dashboard should appear for that account.

Only grant `admin` or `staff` to trusted staff accounts. Do not let customers choose their own role.

## 4. Run locally
From this folder, start a local web server. For example, in VS Code use the Live Server extension and open `index.html`. Do not open the file directly with `file://`.

## 5. Publish
Upload all five files to the same folder/repository on your web host. Keep the filenames unchanged.

## Important security and privacy notes
- The `sb_publishable_...` key is intended for browser applications. It is not a secret. Database and Storage RLS policies are essential.
- Never put a Supabase `service_role` or secret key in `supabase-config.js`, HTML, JavaScript, GitHub, or any browser-accessible file.
- Loan applications include highly sensitive personal data (National ID details and document images). The SQL policies restrict records to the applicant and authorised staff; the storage bucket is private.
- Before collecting real documents, confirm the organisation's legal authority to offer credit, publish a clear privacy notice, define retention/deletion procedures, and obtain appropriate consent. Use test data until the site has been reviewed.
- This is a front-end integration starter, not a legal or regulatory compliance certification.
