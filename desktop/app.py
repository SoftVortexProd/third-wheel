"""Third Wheel desktop shell: starts the bundled C# server and shows the web UI."""
import atexit
import ctypes
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

from PySide6.QtCore import QSettings, QTimer, QUrl, Qt
from PySide6.QtGui import QColor, QDesktopServices, QIcon, QPalette
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineScript, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QLabel, QMainWindow, QStackedWidget

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
        self.setCentralWidget(self.stack)
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
        self.view = QWebEngineView()
        self.view.setPage(self.page)
        s = self.page.settings()
        s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanOpenWindows, False)
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
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

    def stop_server(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(3)
            except Exception:
                self.proc.kill()

    def closeEvent(self, e):
        self.settings.setValue("geometry", self.saveGeometry())
        self.stop_server()
        super().closeEvent(e)


def main():
    if os.name == "nt":
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ThirdWheel.Desktop")
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
