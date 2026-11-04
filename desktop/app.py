"""Third Wheel desktop shell: starts the bundled C# server and shows the web UI."""
import atexit
import ctypes
import json
import os
import subprocess
import sys
import threading
import time
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path

from PySide6.QtCore import QObject, QSettings, QTimer, QUrl, Qt, Signal, QThread
from PySide6.QtGui import QColor, QDesktopServices, QIcon, QPalette, QKeySequence, QShortcut
import re

from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineScript, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import (QApplication, QHBoxLayout, QLabel, QMainWindow, QPushButton, QStackedWidget,
                               QSystemTrayIcon, QVBoxLayout, QWidget)

try:  # Qt 6.8+
    from PySide6.QtWebEngineCore import QWebEnginePermission
except ImportError:  # pragma: no cover
    QWebEnginePermission = None

# Notification clicks may only open chats; anything else the page sends is ignored.
ROUTE_RE = re.compile(r"^#/(dm|group)/\d{1,12}$")

# ---- update check: compares this version with the latest GitHub release (bump APP_VERSION when you publish a release) ----
APP_VERSION = os.environ.get("TW_APP_VERSION", "0.7.0")
UPDATE_REPO = "SoftVortexProd/third-wheel"


def version_tuple(v: str) -> tuple:
    return tuple(int(p) for p in re.findall(r"\d+", v)[:4])


def latest_release() -> tuple[str, str, str | None] | None:
    """(version, release page url, download url) or None. Network errors just mean 'no update info'."""
    try:
        req = urllib.request.Request(f"https://api.github.com/repos/{UPDATE_REPO}/releases/latest",
                                     headers={"User-Agent": "ThirdWheel-Desktop", "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.load(r)
        tag = str(data.get("tag_name", "")).strip().lstrip("vV")
        url = str(data.get("html_url", ""))
        if not tag or not url.startswith(f"https://github.com/{UPDATE_REPO}/"):
            return None

        download_url = None
        for asset in data.get("assets", []):
            name = str(asset.get("name", "")).lower()
            if name.endswith(".zip") and ("win64" in name or "desktop" in name):
                download_url = str(asset.get("browser_download_url", ""))
                break
        if not download_url:
            download_url = f"https://github.com/{UPDATE_REPO}/releases/download/v{tag}/ThirdWheel-desktop-v{tag}-win64.zip"

        return tag, url, download_url
    except Exception:
        return None


class UpdateBus(QObject):
    found = Signal(str, str, str)   # version, release url, download url


class UpdateInstaller(QThread):
    progress = Signal(int, str)
    finished = Signal(str)
    failed = Signal(str)

    def __init__(self, download_url: str):
        super().__init__()
        self.download_url = download_url

    def run(self):
        try:
            self.progress.emit(5, "Connecting…")
            tmp_dir = Path(tempfile.gettempdir()) / "ThirdWheel_update"
            if tmp_dir.exists():
                shutil.rmtree(tmp_dir, ignore_errors=True)
            tmp_dir.mkdir(parents=True, exist_ok=True)
            zip_path = tmp_dir / "update.zip"

            req = urllib.request.Request(self.download_url, headers={"User-Agent": "ThirdWheel-Desktop"})
            # DNS hiccups (getaddrinfo failed) are usually momentary: try a few times before giving up.
            resp_cm = None
            for attempt in range(4):
                try:
                    resp_cm = urllib.request.urlopen(req, timeout=40)
                    break
                except Exception as ex:
                    if attempt == 3:
                        raise
                    self.progress.emit(5, f"Connection problem, retrying ({attempt + 1}/3)…")
                    time.sleep(2 + attempt * 2)
            with resp_cm as resp:
                total_size = int(resp.headers.get("content-length", 0))
                downloaded = 0
                chunk_size = 65536
                with open(zip_path, "wb") as f:
                    while True:
                        chunk = resp.read(chunk_size)
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            pct = min(85, int((downloaded / total_size) * 80) + 5)
                            mb_done = downloaded / (1024 * 1024)
                            mb_total = total_size / (1024 * 1024)
                            self.progress.emit(pct, f"{mb_done:.1f} / {mb_total:.1f} MB")
                        else:
                            self.progress.emit(50, "Downloading…")

            self.progress.emit(88, "Extracting files…")
            extract_dir = tmp_dir / "extracted"
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(extract_dir)

            src_dir = extract_dir
            if not (src_dir / "ThirdWheel.exe").exists():
                sub = src_dir / "ThirdWheel"
                if (sub / "ThirdWheel.exe").exists():
                    src_dir = sub
                else:
                    for p in extract_dir.glob("**/ThirdWheel.exe"):
                        src_dir = p.parent
                        break

            if not (src_dir / "ThirdWheel.exe").exists():
                self.failed.emit("Update archive does not contain ThirdWheel.exe.")
                return

            self.progress.emit(100, "Update ready.")
            self.finished.emit(str(src_dir))
        except Exception as ex:
            self.failed.emit(str(ex))


def apply_update_and_restart(src_dir: str):
    app_dir = base_dir()
    exe_path = sys.executable if getattr(sys, "frozen", False) else app_dir / "ThirdWheel.exe"
    pid = os.getpid()

    tmp = Path(tempfile.gettempdir()) / "ThirdWheel_update"
    tmp.mkdir(parents=True, exist_ok=True)
    helper_bat = tmp / "apply_update.bat"

    bat_content = f"""@echo off
set "PID={pid}"
set "SRC={src_dir}"
set "DST={app_dir}"
set "EXE={exe_path}"

:wait_loop
tasklist /fi "pid eq %PID%" 2>NUL | findstr /i "%PID%" >NUL
if not errorlevel 1 (
    timeout /t 1 /nobreak >NUL
    goto wait_loop
)
timeout /t 1 /nobreak >NUL

robocopy "%SRC%" "%DST%" /e /r:5 /w:1 /np >NUL
if errorlevel 8 (
    xcopy /s /e /y /q "%SRC%\\*" "%DST%\\" >NUL
)

start "" "%EXE%"
exit
"""
    helper_bat.write_text(bat_content, encoding="ascii", errors="replace")

    flags = 0x08000000 | 0x00000200  # CREATE_NO_WINDOW | DETACHED_PROCESS
    subprocess.Popen(["cmd.exe", "/c", str(helper_bat)], creationflags=flags)
    QApplication.quit()


LOCAL_URL = "http://127.0.0.1:5173"
BG = "#0f1115"
ACCENT = "#7c8cff"
MUTED = "#8b93a7"


def base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent


def configured_server() -> str | None:
    """Hosted server URL: TW_SERVER env var wins, then config.json next to the exe ({"server": "https://..."})."""
    url = os.environ.get("TW_SERVER", "").strip()
    if not url:
        try:
            url = str(json.loads((base_dir() / "config.json").read_text("utf-8")).get("server", "")).strip()
        except Exception:
            url = ""
    q = QUrl(url)
    if url and q.scheme() in ("http", "https") and q.host():
        return url.rstrip("/")
    return None


REMOTE_URL = configured_server()
HOST_URL = REMOTE_URL or LOCAL_URL


def same_origin(url: QUrl) -> bool:
    a, b = url, QUrl(HOST_URL)
    return a.scheme() == b.scheme() and a.host() == b.host() and a.port(-1) == b.port(-1)


def resource(name: str) -> Path:
    root = Path(getattr(sys, "_MEIPASS", base_dir()))
    return root / name


def find_server() -> Path | None:
    here = base_dir()
    for cand in (here / "server" / "Server.exe",
                 here.parent / "dist" / "server" / "Server.exe",
                 here / "dist" / "server" / "Server.exe"):
        if cand.exists():
            return cand
    return None


def server_up() -> bool:
    try:
        with urllib.request.urlopen(HOST_URL + "/api/meta", timeout=3 if REMOTE_URL else 1) as r:
            return r.status == 200
    except Exception:
        return False


class Job:
    """Windows job object so the server dies with us even on a hard kill."""

    def __init__(self):
        self.handle = None
        if os.name != "nt":
            return
        k32 = ctypes.windll.kernel32
        k32.CreateJobObjectW.restype = ctypes.c_void_p
        h = k32.CreateJobObjectW(None, None)

        class BASIC(ctypes.Structure):
            _fields_ = [("a", ctypes.c_int64), ("b", ctypes.c_int64), ("LimitFlags", ctypes.c_uint32),
                        ("c", ctypes.c_size_t), ("d", ctypes.c_size_t), ("e", ctypes.c_uint32),
                        ("f", ctypes.c_size_t), ("g", ctypes.c_uint32), ("h", ctypes.c_uint32)]

        class IO(ctypes.Structure):
            _fields_ = [(n, ctypes.c_uint64) for n in "abcdef"]

        class EXT(ctypes.Structure):
            _fields_ = [("Basic", BASIC), ("Io", IO), ("p", ctypes.c_size_t), ("j", ctypes.c_size_t),
                        ("pm", ctypes.c_size_t), ("pk", ctypes.c_size_t)]

        info = EXT()
        info.Basic.LimitFlags = 0x2000  # KILL_ON_JOB_CLOSE
        k32.SetInformationJobObject(ctypes.c_void_p(h), 9, ctypes.byref(info), ctypes.sizeof(info))
        self.handle = h

    def add(self, proc: subprocess.Popen):
        if self.handle and os.name == "nt":
            ctypes.windll.kernel32.AssignProcessToJobObject(
                ctypes.c_void_p(self.handle), ctypes.c_void_p(int(proc._handle)))


# ---- game detection: matches running programs against a fixed list; only the game NAME ever leaves this process ----
# Names must match the game list the server offers.
GAME_EXES = {
    "valorant-win64-shipping.exe": "Valorant", "robloxplayerbeta.exe": "Roblox", "fortniteclient-win64-shipping.exe": "Fortnite",
    "league of legends.exe": "League of Legends", "cs2.exe": "Counter-Strike 2", "r5apex.exe": "Apex Legends", "r5apex_dx12.exe": "Apex Legends",
    "overwatch.exe": "Overwatch 2", "rocketleague.exe": "Rocket League", "among us.exe": "Among Us", "genshinimpact.exe": "Genshin Impact",
    "yuanshen.exe": "Genshin Impact", "cod.exe": "Call of Duty", "modernwarfare.exe": "Call of Duty", "rainbowsix.exe": "Rainbow Six Siege",
    "rainbowsix_vulkan.exe": "Rainbow Six Siege", "dota2.exe": "Dota 2", "eldenring.exe": "Elden Ring", "stardew valley.exe": "Stardew Valley",
    "helldivers2.exe": "Helldivers 2", "destiny2.exe": "Destiny 2", "marvel-win64-shipping.exe": "Marvel Rivals",
    "palworld-win64-shipping.exe": "Palworld", "terraria.exe": "Terraria", "minecraft.windows.exe": "Minecraft", "re9.exe": "Resident Evil Requiem",
    "fc24.exe": "FIFA / FC", "fc25.exe": "FIFA / FC", "fc26.exe": "FIFA / FC", "fifa23.exe": "FIFA / FC", "mk8.exe": "Mario Kart",
}


def _processes() -> dict[int, str]:
    """pid -> lower-case exe name, via the Windows toolhelp snapshot (no extra dependencies)."""
    from ctypes import wintypes

    class ENTRY(ctypes.Structure):
        _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD), ("th32ProcessID", wintypes.DWORD),
                    ("th32DefaultHeapID", ctypes.c_size_t), ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                    ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", wintypes.LONG), ("dwFlags", wintypes.DWORD),
                    ("szExeFile", ctypes.c_wchar * 260)]

    k32 = ctypes.windll.kernel32
    k32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    k32.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    k32.Process32FirstW.argtypes = k32.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(ENTRY)]
    k32.CloseHandle.argtypes = [wintypes.HANDLE]
    snap = k32.CreateToolhelp32Snapshot(0x2, 0)
    out: dict[int, str] = {}
    if not snap or snap == wintypes.HANDLE(-1).value:
        return out
    try:
        e = ENTRY()
        e.dwSize = ctypes.sizeof(ENTRY)
        ok = k32.Process32FirstW(snap, ctypes.byref(e))
        while ok:
            out[e.th32ProcessID] = e.szExeFile.lower()
            ok = k32.Process32NextW(snap, ctypes.byref(e))
    finally:
        k32.CloseHandle(snap)
    return out


def _window_titles() -> list[tuple[int, str]]:
    from ctypes import wintypes
    u32 = ctypes.windll.user32
    found: list[tuple[int, str]] = []
    proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def cb(hwnd, _):
        if u32.IsWindowVisible(hwnd):
            n = u32.GetWindowTextLengthW(hwnd)
            if n:
                buf = ctypes.create_unicode_buffer(n + 1)
                u32.GetWindowTextW(hwnd, buf, n + 1)
                pid = wintypes.DWORD()
                u32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                found.append((pid.value, buf.value))
        return True

    u32.EnumWindows(proc(cb), 0)
    return found


def detect_game() -> str | None:
    if os.name != "nt":
        return None
    try:
        procs = _processes()
        running = set(procs.values())
        for exe, game in GAME_EXES.items():
            if exe in running:
                return game
        # Minecraft / Lunar Client run inside java: tell them apart by window title.
        java = {pid for pid, exe in procs.items() if exe in ("javaw.exe", "java.exe")}
        if java:
            for pid, title in _window_titles():
                if pid in java:
                    if title.startswith("Lunar Client"):
                        return "Lunar Client"
                    if title.startswith("Minecraft"):
                        return "Minecraft"
    except Exception:
        pass
    return None


class Page(QWebEnginePage):
    def acceptNavigationRequest(self, url, nav_type, is_main):
        if url.scheme() in ("about", "blob", "data") or same_origin(url):
            return True
        QDesktopServices.openUrl(url)
        return False

    def createWindow(self, _type):
        # target=_blank links: route through a throwaway page that hands off to the browser
        page = QWebEnginePage(self.profile(), self)
        page.urlChanged.connect(lambda u: (QDesktopServices.openUrl(u), page.deleteLater()))
        return page


class Main(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Third Wheel")
        self.setMinimumSize(1100, 700)
        self.setIcon()
        self.settings = QSettings("ThirdWheel", "Desktop")
        geo = self.settings.value("geometry")
        if geo:
            self.restoreGeometry(geo)
        else:
            self.resize(1280, 800)

        self.stack = QStackedWidget()
        # A slim banner above the page announces new releases (hidden until the update check finds one).
        self.update_url = ""
        self.update_version = ""
        self.download_url = ""
        self.update_installer = None
        self.update_bar = QWidget()
        self.update_bar.setStyleSheet(f"background:#1b1e45;")
        bar = QHBoxLayout(self.update_bar)
        bar.setContentsMargins(14, 8, 10, 8)
        bar.setSpacing(8)
        self.update_label = QLabel()
        self.update_label.setWordWrap(True)
        self.update_label.setStyleSheet("color:#e8eaf2;font:600 13px 'Segoe UI';")
        bar.addWidget(self.update_label, 1)

        flat = "QPushButton{border:0;border-radius:6px;padding:6px 12px;font:600 12px 'Segoe UI';%s}QPushButton:hover{background:%s;}QPushButton:disabled{opacity:0.6;background:#32366b;color:#8f97cc;}"
        self.btn_update = QPushButton("Update & restart")
        self.btn_update.setCursor(Qt.PointingHandCursor)
        self.btn_update.setStyleSheet(flat % ("background:#4f5ee6;color:#fff;", "#6270ee"))
        self.btn_update.clicked.connect(self.start_update)

        self.btn_skip = QPushButton("Skip this version")
        self.btn_skip.setCursor(Qt.PointingHandCursor)
        self.btn_skip.setStyleSheet(flat % ("background:transparent;color:#aab2ff;", "#26294f"))
        self.btn_skip.clicked.connect(self.skip_update)

        self.btn_later = QPushButton("Later")
        self.btn_later.setCursor(Qt.PointingHandCursor)
        self.btn_later.setStyleSheet(flat % ("background:transparent;color:#aab2ff;", "#26294f"))
        self.btn_later.clicked.connect(self.hide_update)

        bar.addWidget(self.btn_update)
        bar.addWidget(self.btn_skip)
        bar.addWidget(self.btn_later)
        self.update_bar.hide()
        holder = QWidget()
        col = QVBoxLayout(holder)
        col.setContentsMargins(0, 0, 0, 0)
        col.setSpacing(0)
        col.addWidget(self.update_bar)
        col.addWidget(self.stack, 1)
        self.setCentralWidget(holder)
        self.splash = QLabel("Third Wheel\n\nStarting…")
        self.splash.setAlignment(Qt.AlignCenter)
        self.splash.setStyleSheet(f"background:{BG};color:{MUTED};font:600 18px 'Segoe UI';")
        self.stack.addWidget(self.splash)

        data = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "ThirdWheel" / "webprofile"
        data.mkdir(parents=True, exist_ok=True)
        self.profile = QWebEngineProfile("ThirdWheel", self)
        self.profile.setPersistentStoragePath(str(data))
        self.profile.setCachePath(str(data / "cache"))
        self.profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.ForcePersistentCookies)
        # The window inherits Windows' "reduce motion" switch, which silently disables every animation.
        # Default the desktop app to animations on (still changeable in Settings -> Animations).
        motion = QWebEngineScript()
        motion.setName("tw-motion-default")
        motion.setSourceCode("window.__TW_DESKTOP=true;try{if(!localStorage.getItem('tw_motion'))localStorage.setItem('tw_motion','on')}catch(e){}")
        motion.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
        motion.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
        motion.setRunsOnSubFrames(False)
        self.profile.scripts().insert(motion)
        self.page = Page(self.profile, self)
        self.page.setBackgroundColor(QColor(BG))
        # Web Notifications (only offered on secure origins): allow them for the app's own origin and show them via the tray.
        self.profile.setNotificationPresenter(self.present_web_notification)
        if QWebEnginePermission is not None and hasattr(self.page, "permissionRequested"):
            self.page.permissionRequested.connect(self.on_permission)
        self.view = QWebEngineView()
        self.view.setPage(self.page)
        s = self.page.settings()
        s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanOpenWindows, False)
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)
        # Fullscreen: the page's own button (and videos) ask for it; F11 / Esc work from the keyboard too.
        self.page.fullScreenRequested.connect(self.on_fullscreen)
        QShortcut(QKeySequence("F11"), self, activated=self.toggle_fullscreen)
        if getattr(sys, "frozen", False):
            self.view.setContextMenuPolicy(Qt.NoContextMenu)
        self.stack.addWidget(self.view)

        self.proc = None
        self.job = Job()
        self.tries = 0
        atexit.register(self.stop_server)
        self.start_server()
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.poll)
        self.timer.start(400)

        # Game detection: look every few seconds, tell the page only when it changes (and again after any reload).
        self.game = None
        self.view.loadFinished.connect(lambda ok: ok and self.push_game())
        self.game_timer = QTimer(self)
        self.game_timer.timeout.connect(self.scan_game)
        self.game_timer.start(6000)

        # Update check: a few seconds after launch, in the background (set TW_NO_UPDATE_CHECK=1 to turn it off).
        self.update_bus = UpdateBus()
        self.update_bus.found.connect(self.show_update)
        if not os.environ.get("TW_NO_UPDATE_CHECK"):
            QTimer.singleShot(4000, lambda: threading.Thread(target=self._update_worker, daemon=True).start())

        # Notifications: the page queues alerts (window.TWApp._q) when it's in the background; we turn them into
        # Windows notifications from the tray icon. This works on plain-http servers too, where the browser API is unavailable.
        self.tray_route = None
        self.tray = QSystemTrayIcon(self.windowIcon(), self)
        self.tray.setToolTip("Third Wheel")
        self.tray.messageClicked.connect(self.focus_window)
        self.tray.activated.connect(lambda reason: self.focus_window(False) if reason == QSystemTrayIcon.ActivationReason.Trigger else None)
        self.tray.show()
        self.notify_timer = QTimer(self)
        self.notify_timer.timeout.connect(self.drain_notifications)
        self.notify_timer.start(1500)

    def setIcon(self):
        for p in (resource("app.ico"), base_dir() / "app.ico"):
            if p.exists():
                self.setWindowIcon(QIcon(str(p)))
                return

    def start_server(self):
        if REMOTE_URL:  # hosted server: nothing to launch locally
            self.splash.setText("Third Wheel\n\nConnecting…")
            return
        if server_up():
            return
        exe = find_server()
        if not exe:
            self.splash.setText("Third Wheel\n\nServer.exe not found.\nRun build.ps1 first.")
            return
        flags = 0x08000000 if os.name == "nt" else 0  # CREATE_NO_WINDOW
        env = dict(os.environ, ASPNETCORE_URLS=HOST_URL)
        self.proc = subprocess.Popen([str(exe)], cwd=str(exe.parent), env=env, creationflags=flags,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.job.add(self.proc)

    def poll(self):
        self.tries += 1
        if server_up():
            self.timer.stop()
            self.view.setUrl(QUrl(HOST_URL))
            self.stack.setCurrentWidget(self.view)
        elif self.proc is not None and self.proc.poll() is not None:
            self.timer.stop()
            self.splash.setText(f"Third Wheel\n\nServer exited (code {self.proc.returncode}).")
        elif REMOTE_URL:
            # keep retrying: the hosted server may be restarting or the network briefly down
            self.splash.setText(f"Third Wheel\n\nCan't reach {REMOTE_URL}\nRetrying…")
        elif self.tries > 100:
            self.timer.stop()
            self.splash.setText("Third Wheel\n\nServer did not respond.")

    def scan_game(self):
        g = detect_game()
        if g != self.game:
            self.game = g
            self.push_game()

    def push_game(self):
        self.page.runJavaScript(f"window.TWApp&&window.TWApp.game({json.dumps(self.game)})")

    # ---- notifications ----
    def drain_notifications(self):
        if self.stack.currentWidget() is self.view:
            self.page.runJavaScript(
                "window.TWApp&&window.TWApp.drain?JSON.stringify(window.TWApp.drain()):'[]'", self.show_notifications)

    def show_notifications(self, raw):
        try:
            items = json.loads(raw) if isinstance(raw, str) else []
        except ValueError:
            return
        if not isinstance(items, list):
            return
        for it in items[:4]:
            if not isinstance(it, dict):
                continue
            route = it.get("route")
            self.tray_route = route if isinstance(route, str) and ROUTE_RE.match(route) else None
            self.tray.showMessage(str(it.get("title", "Third Wheel"))[:80], str(it.get("body", ""))[:220], self.windowIcon(), 8000)
            QApplication.alert(self, 0)   # flash the taskbar button until the window is focused

    def present_web_notification(self, note):
        note.show()
        self.tray_route = None
        self.tray.showMessage(note.title()[:80], note.message()[:220], self.windowIcon(), 8000)
        QApplication.alert(self, 0)

    def toggle_fullscreen(self):
        if self.isFullScreen():
            self.showNormal()
            if getattr(self, "_was_max", False):
                self.showMaximized()
        else:
            self._was_max = self.isMaximized()
            self.showFullScreen()

    def on_fullscreen(self, request):
        request.accept()
        if request.toggleOn() != self.isFullScreen():
            self.toggle_fullscreen()

    def on_permission(self, perm):
        pt = perm.permissionType()
        # notifications and the microphone (voice messages), only for the app's own server
        if pt in (QWebEnginePermission.PermissionType.Notifications, QWebEnginePermission.PermissionType.MediaAudioCapture) and same_origin(perm.origin()):
            perm.grant()

    def focus_window(self, open_chat=True):
        if self.isMinimized():
            self.showNormal()
        self.show()
        self.raise_()
        self.activateWindow()
        if open_chat and self.tray_route:
            self.page.runJavaScript(f"location.hash={json.dumps(self.tray_route)}")
        self.tray_route = None

    def _update_worker(self):
        info = latest_release()
        if info and version_tuple(info[0]) > version_tuple(APP_VERSION):
            self.update_bus.found.emit(*info)

    def show_update(self, version: str, url: str, download_url: str = ""):
        if self.settings.value("skippedVersion") == version:
            return
        self.update_version, self.update_url, self.download_url = version, url, download_url
        self.update_label.setText(f"Third Wheel {version} is available (you have {APP_VERSION}).")
        self.btn_update.setText("Update & restart")
        self.btn_update.setEnabled(True)
        self.btn_skip.show()
        self.btn_later.show()
        self.update_bar.show()

    def start_update(self):
        if not getattr(sys, "frozen", False):
            if self.update_url:
                QDesktopServices.openUrl(QUrl(self.update_url))
            self.update_bar.hide()
            return
        if not self.download_url:
            if self.update_url:
                QDesktopServices.openUrl(QUrl(self.update_url))
            self.update_bar.hide()
            return

        self.btn_update.setEnabled(False)
        self.btn_update.setText("Connecting…")
        self.btn_skip.hide()
        self.btn_later.hide()

        self.update_installer = UpdateInstaller(self.download_url)
        self.update_installer.progress.connect(self._on_update_progress)
        self.update_installer.finished.connect(self._on_update_ready)
        self.update_installer.failed.connect(self._on_update_failed)
        self.update_installer.start()

    def _on_update_progress(self, pct: int, msg: str):
        self.update_label.setText(f"Updating to {self.update_version}… {msg}")
        self.btn_update.setText(f"{pct}%")

    def _on_update_ready(self, src_dir: str):
        self.update_label.setText("Update ready! Restarting Third Wheel…")
        self.btn_update.setText("Restarting…")
        QTimer.singleShot(500, lambda: apply_update_and_restart(src_dir))

    def _on_update_failed(self, err: str):
        self.update_label.setText(f"Auto-update failed ({err[:60]}).")
        self.btn_update.setText("Download manually")
        self.btn_update.setEnabled(True)
        try:
            self.btn_update.clicked.disconnect()
        except Exception:
            pass
        self.btn_update.clicked.connect(self.open_update)
        self.btn_later.show()

    def open_update(self):
        if self.update_url:
            QDesktopServices.openUrl(QUrl(self.update_url))
        self.update_bar.hide()

    def skip_update(self):
        self.settings.setValue("skippedVersion", self.update_version)
        self.update_bar.hide()

    def hide_update(self):
        self.update_bar.hide()

    def stop_server(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(3)
            except Exception:
                self.proc.kill()

    def closeEvent(self, e):
        self.settings.setValue("geometry", self.saveGeometry())
        self.tray.hide()   # no ghost icon left in the notification area
        self.stop_server()
        super().closeEvent(e)


def main():
    if os.name == "nt":
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ThirdWheel.Desktop")
    # The hosted server is often plain http (no certificate). Browsers only allow the microphone on secure pages, so treat the app's own
    # server address as secure for voice messages. Only that one address; every other site keeps the normal rules.
    if HOST_URL.startswith("http://"):
        flag = "--unsafely-treat-insecure-origin-as-secure=" + HOST_URL.rstrip("/")
        os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = (os.environ.get("QTWEBENGINE_CHROMIUM_FLAGS", "") + " " + flag).strip()
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    pal = QPalette()
    pal.setColor(QPalette.Window, QColor(BG))
    pal.setColor(QPalette.WindowText, QColor("#e8eaf2"))
    app.setPalette(pal)
    w = Main()
    w.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
