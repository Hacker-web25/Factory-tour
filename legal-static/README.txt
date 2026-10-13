VPV public pages as plain HTML — for myvpv.com on BigRock
=========================================================

Folders here: pricing, terms, privacy, refund-policy, shipping-policy,
cookies, disclaimer, security, about, contact, legal. Each holds one
index.html with the styling built in and no JavaScript.

Upload (cPanel)
  1. BigRock -> Hosting -> cPanel -> File Manager
  2. Open public_html (the folder with myvpv.com's index.html)
  3. Upload bigrock-upload.zip there, right-click -> Extract
  4. Open https://myvpv.com/pricing and https://myvpv.com/terms to check
  5. Paste footer-snippet.html into public_html/index.html before </body>

About the pricing page
  These copies carry no JavaScript, so the scene slider cannot move here.
  The full price ladder is shown as a table instead, so every price is
  visible to a customer or a payment-gateway reviewer. The "Get started"
  button links to app.myvpv.com, where the live calculator runs.

If /terms shows the home page instead of the Terms page
  The site's .htaccess is sending every URL to index.html. In
  public_html/.htaccess make sure the two RewriteCond lines are present:

     RewriteEngine On
     RewriteBase /
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /index.html [L]

After any price or policy change
     npm run build && npm start          (leave running)
     node scripts/export-legal-static.mjs http://localhost:3000 legal-static
  then upload the new folders again.
