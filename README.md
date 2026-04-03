# repocomment

Small static form that sends data to Google Apps Script and stores it in Google Sheets.

## Recovery Point

Known-good baseline:

- Release: `Milestone 1`
- Tag: `milestone-1`
- Commit: `2c170c2`

## What This Saves

Each submission is stored in this order:

1. Current date and time
2. Initials
3. Comment

## Form Rules

- Initials must be exactly 2 letters
- No numbers are allowed
- Comment can be up to 200 characters

## Files

- `index.html` - page markup
- `styles.css` - styling
- `script.js` - validation and submit logic
- `google-apps-script/Code.gs` - sample Apps Script backend code

## Google Apps Script

Your frontend is already set to submit to:

`https://script.google.com/macros/s/AKfycbzhQA4vGm-GUmG5up12ruF58krwrdyEA1jgQ2_R6-25YQB5Hk-BX24IvtsmtLXSSNkK/exec`

In your Google Sheet:

1. Open the sheet linked to your Apps Script project.
2. Keep the first sheet as the destination sheet, or update `getActiveSheet()` in `Code.gs`.
3. Optional headers for row 1:
   - `Timestamp`
   - `Initials`
   - `Comment`

## Link This Folder To GitHub

This local folder is already linked to:

`https://github.com/MM07013/repocomment.git`

## Deploy Frontend With GitHub Pages

After pushing:

1. Open the GitHub repository.
2. Go to `Settings` -> `Pages`.
3. Under Source, choose `Deploy from a branch`.
4. Select `main` and `/ (root)`.
5. Save.

Your page will then be available from GitHub Pages at:

`https://mm07013.github.io/repocomment/`
