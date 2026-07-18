# PixelPrompt Complete

## First run
```powershell
npm install
npm run install:all
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
npm run dev
```
Open http://localhost:5173

SQLite database is created automatically in `server/data/pixelprompt.db`.
