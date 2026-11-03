# Third Wheel

Find groups of people who share your games. Search by game, casual or competitive, region and age range; join group chats; invite friends into your groups.

- **Server:** C# / ASP.NET Core (.NET 10) + SQLite, in `server/`. Serves the API and the web UI.
- **Web UI:** vanilla HTML/CSS/JS in `server/wwwroot/` (no gradients, tokenized CSS). Desktop layout is Discord-style with a friends list on the right; below 900px it switches to the mobile layout (bottom bar: Feed, a raised round Search button, Friends).
- **Desktop app:** Python + PySide6 window in `desktop/`, packaged to `ThirdWheel.exe` with PyInstaller. It starts the bundled server itself.
- **Mobile:** the same UI as an installable web app (PWA). It is not a native app.

## Build the desktop exe

Needs .NET 10 SDK and Python 3.12+.

```powershell
.\build.ps1
```

Output: `dist\ThirdWheel\ThirdWheel.exe` (keep the `_internal` and `server` folders beside it).

## Run from source

```powershell
cd server
dotnet run --no-launch-profile   # http://127.0.0.1:5173
```

Demo accounts (seeded on first run): `nova_fox`, `kairo`, `pixelpanda`... password `Demo1234!`.
Data lives in `%LOCALAPPDATA%\ThirdWheel\tw.db` (delete it to reset).

## Phone

The server only listens on `127.0.0.1`, so a phone cannot reach it yet. Allowing LAN access is not implemented; host the server somewhere reachable, open it in the phone browser and use "Add to Home Screen".

## Security

PBKDF2 password hashing, HttpOnly SameSite=Strict session cookie, `X-TW` header required on all writes (CSRF), parameterized SQL, all user text HTML-encoded on the server and rendered with `textContent` in the UI, CSP and other security headers, login rate limiting.
