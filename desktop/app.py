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
                               QSystemTrayIcon, QVBoxLayout, QWidget, QMessageBox, QMenu)

try:  # Qt 6.8+
    from PySide6.QtWebEngineCore import QWebEnginePermission
except ImportError:  # pragma: no cover
    QWebEnginePermission = None

# Notification clicks may only open chats; anything else the page sends is ignored.
ROUTE_RE = re.compile(r"^#/(dm|group)/\d{1,12}$")

# ---- update check: compares this version with the latest GitHub release (bump APP_VERSION when you publish a release) ----
APP_VERSION = os.environ.get("TW_APP_VERSION", "0.9.6")
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



import base64
import hashlib


class ClipCatcher(QObject):
    """Clip catcher: while a known game is running (and the clip catcher is on), one ffmpeg process records the screen into a ring of short
    segments on disk. F8 stitches the last ~30 seconds into a small WebM (plays in this app's browser) and hands it to the page, which asks
    where to post it. Nothing is recorded when no game is running, and nothing runs in this app's own UI thread (the old screenshot loop did,
    and made the window flicker)."""
    SEG_SECONDS = 5
    SEG_COUNT = 10          # ring size: 50 s of material, the last 30 s are used
    CLIP_SECONDS = 30
    ready = Signal(str, str)     # (clip name, path)
    notice = Signal(str, str)    # (title, text)
    ffmpeg_ready = Signal(bool)

    GYAN = "https://www.gyan.dev/ffmpeg/builds"

    def __init__(self, main_win):
        super().__init__(main_win)
        self.main = main_win
        local = os.environ.get("LOCALAPPDATA") or str(Path.home())
        self.home = Path(local) / "ThirdWheel"
        self.ring = self.home / "clipring"
        self.proc = None
        self.game = None
        self.busy = False
        self.downloading = False
        self.enabled = bool(main_win.settings.value("clips/enabled", True, type=bool))
        self.ffmpeg_path = self.find_ffmpeg()
        self.ready.connect(self._deliver)
        self.notice.connect(lambda t, m: self.main.tray.showMessage(t, m, QSystemTrayIcon.MessageIcon.Information, 4000))
        self.ffmpeg_ready.connect(lambda ok: self.refresh())
        QTimer.singleShot(0, self.sweep_old)

    # ---- ffmpeg ----
    def find_ffmpeg(self) -> str | None:
        own = self.home / "ffmpeg" / "ffmpeg.exe"
        if own.exists():
            return str(own)
        p = shutil.which("ffmpeg")
        if p and Path(p).exists():
            return p
        for cand in [base_dir() / "ffmpeg.exe", base_dir() / "ffmpeg" / "ffmpeg.exe"]:
            if cand.exists():
                return str(cand)
        return None

    def download_ffmpeg(self):
        """Fetch ffmpeg once (about 90 MB, kept in %LOCALAPPDATA%\\ThirdWheel\\ffmpeg) after checking the published SHA-256."""
        if self.downloading:
            return
        self.downloading = True
        self.notice.emit("Third Wheel Clip Catcher", "Downloading the video tool (ffmpeg, ~90 MB). I'll tell you when it's ready.")

        def work():
            ok = False
            tmp = Path(tempfile.mkdtemp(prefix="tw-ffmpeg-"))
            try:
                zpath = tmp / "ffmpeg.zip"
                with urllib.request.urlopen(f"{self.GYAN}/ffmpeg-release-essentials.zip", timeout=60) as r, open(zpath, "wb") as f:
                    shutil.copyfileobj(r, f)
                want = urllib.request.urlopen(f"{self.GYAN}/ffmpeg-release-essentials.zip.sha256", timeout=30).read().decode().strip().split()[0].lower()
                h = hashlib.sha256()
                with open(zpath, "rb") as f:
                    for chunk in iter(lambda: f.read(1 << 20), b""):
                        h.update(chunk)
                if not re.fullmatch(r"[0-9a-f]{64}", want) or h.hexdigest() != want:
                    raise RuntimeError("checksum mismatch")
                with zipfile.ZipFile(zpath) as z:
                    member = next((n for n in z.namelist() if n.lower().endswith("/bin/ffmpeg.exe")), None)
                    if not member:
                        raise RuntimeError("ffmpeg.exe not in download")
                    (self.home / "ffmpeg").mkdir(parents=True, exist_ok=True)
                    with z.open(member) as src, open(self.home / "ffmpeg" / "ffmpeg.exe", "wb") as dst:
                        shutil.copyfileobj(src, dst)
                ok = True
            except Exception as e:
                self.notice.emit("Third Wheel Clip Catcher", f"Couldn't get the video tool: {str(e)[:60]}")
            finally:
                shutil.rmtree(tmp, ignore_errors=True)
                self.downloading = False
                if ok:
                    self.ffmpeg_path = self.find_ffmpeg()
                    self.notice.emit("Third Wheel Clip Catcher", "Ready. Clips are recorded while a game is running. Press F8 to keep the last 30 seconds.")
                self.ffmpeg_ready.emit(ok)
        threading.Thread(target=work, daemon=True).start()

    # ---- on/off ----
    def set_enabled(self, on: bool):
        self.enabled = on
        self.main.settings.setValue("clips/enabled", on)
        if on and not self.ffmpeg_path:
            self.download_ffmpeg()
        self.refresh()

    def set_game(self, game):
        self.game = game
        self.refresh()

    def refresh(self):
        want = bool(self.enabled and self.game and self.ffmpeg_path)
        if want and (self.proc is None or self.proc.poll() is not None):
            self.start()
        elif not want and self.proc is not None:
            self.stop()

    def start(self):
        try:
            shutil.rmtree(self.ring, ignore_errors=True)
            self.ring.mkdir(parents=True, exist_ok=True)
            cmd = [self.ffmpeg_path, "-hide_banner", "-loglevel", "error", "-f", "gdigrab", "-framerate", "20", "-draw_mouse", "0", "-i", "desktop",
                   "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "30", "-pix_fmt", "yuv420p",
                   "-g", "40", "-f", "segment", "-segment_time", str(self.SEG_SECONDS), "-segment_wrap", str(self.SEG_COUNT), "-segment_format", "mpegts",
                   str(self.ring / "seg%02d.ts")]
            flags = 0x08000000 | 0x00004000 if os.name == "nt" else 0   # no window, below-normal priority
            self.proc = subprocess.Popen(cmd, creationflags=flags, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            self.proc = None

    def stop(self):
        p, self.proc = self.proc, None
        if p is not None:
            try:
                p.terminate()
                p.wait(3)
            except Exception:
                try:
                    p.kill()
                except Exception:
                    pass
        shutil.rmtree(self.ring, ignore_errors=True)

    def sweep_old(self):
        shutil.rmtree(self.ring, ignore_errors=True)   # leftovers from a crash

    # ---- F8 ----
    def capture(self):
        if self.busy:
            return
        if not self.enabled:
            self.notice.emit("Third Wheel Clip Catcher", "The clip catcher is off. Turn it on from the tray icon.")
            return
        if not self.ffmpeg_path:
            ans = QMessageBox.question(self.main, "Clip catcher", "The clip catcher needs a small video tool (ffmpeg, about 90 MB). Download it now from gyan.dev? It is checked against its published checksum.")
            if ans == QMessageBox.StandardButton.Yes:
                self.download_ffmpeg()
            return
        if self.proc is None or self.proc.poll() is not None:
            self.notice.emit("Third Wheel Clip Catcher", "Start a game first: clips are only recorded while a game is running.")
            return
        segs = sorted([p for p in self.ring.glob("seg*.ts") if p.stat().st_size > 0], key=lambda p: p.stat().st_mtime)
        if len(segs) < 2:
            self.notice.emit("Third Wheel Clip Catcher", "Not enough gameplay recorded yet. Try again in a few seconds.")
            return
        segs = segs[-(self.CLIP_SECONDS // self.SEG_SECONDS + 1):]
        self.busy = True
        self.notice.emit("Third Wheel Clip", "Saving the last 30 seconds...")
        threading.Thread(target=self._encode, args=(segs,), daemon=True).start()

    def _encode(self, segs):
        work = Path(tempfile.mkdtemp(prefix="tw-clip-"))
        try:
            joined = work / "all.ts"
            with open(joined, "wb") as out:
                for s in segs:
                    try:
                        out.write(s.read_bytes())
                    except OSError:
                        pass
            name = f"clip_{time.strftime('%Y%m%d_%H%M%S')}.webm"
            dst = work / name
            cmd = [self.ffmpeg_path, "-hide_banner", "-loglevel", "error", "-y", "-sseof", f"-{self.CLIP_SECONDS}", "-i", str(joined),
                   "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "6", "-b:v", "2M", "-crf", "20", "-an", "-f", "webm", str(dst)]
            flags = 0x08000000 if os.name == "nt" else 0
            subprocess.run(cmd, creationflags=flags, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
            if dst.exists() and dst.stat().st_size > 0:
                keep = Path.home() / "Videos" / "ThirdWheel Clips"
                keep.mkdir(parents=True, exist_ok=True)
                final = keep / name
                shutil.copy2(dst, final)
                self.ready.emit(name, str(final))
            else:
                self.notice.emit("Third Wheel Clip Catcher", "Couldn't save that clip.")
        except Exception as e:
            self.notice.emit("Third Wheel Clip Catcher", f"Clip error: {str(e)[:60]}")
        finally:
            shutil.rmtree(work, ignore_errors=True)
            self.busy = False

    def _deliver(self, name, path):
        """Hand the finished clip to the page (it shows the preview / trim / where-to-post window)."""
        try:
            b64 = base64.b64encode(Path(path).read_bytes()).decode("ascii")
        except OSError:
            return
        try:
            self.main.focus_window(False)
        except Exception:
            pass
        self.main.page.runJavaScript(f"window.TWApp&&window.TWApp.clipReady&&window.TWApp.clipReady({json.dumps(name)},{json.dumps(b64)})")
        self.main.tray.showMessage("Third Wheel Clip", "Clip saved. Choose where to post it.", QSystemTrayIcon.MessageIcon.Information, 3000)


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
        if hasattr(self.page, "featurePermissionRequested"):
            self.page.featurePermissionRequested.connect(self.on_feature_permission)
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

        # Clip Catcher: F8 hotkey captures last 30 seconds of gameplay
        self.clip_catcher = ClipCatcher(self)
        menu = QMenu()
        act_show = menu.addAction("Open Third Wheel")
        act_show.triggered.connect(lambda: self.focus_window(False))
        self.act_clips = menu.addAction("Clip catcher (records while a game runs; F8 saves 30 s)")
        self.act_clips.setCheckable(True)
        self.act_clips.setChecked(self.clip_catcher.enabled)
        self.act_clips.toggled.connect(self.clip_catcher.set_enabled)
        menu.addSeparator()
        menu.addAction("Quit").triggered.connect(self.close)
        self.tray_menu = menu
        self.tray.setContextMenu(menu)
        if os.name == "nt":
            self.hotkey_clip_id = 1088
            ctypes.windll.user32.RegisterHotKey(int(self.winId()), self.hotkey_clip_id, 0, 0x77)  # F8
            self.hotkey_mute_id = 1089
            ctypes.windll.user32.RegisterHotKey(int(self.winId()), self.hotkey_mute_id, 0x0006, 0x4D)  # Ctrl+Shift+M
            self.hotkey_deaf_id = 1090
            ctypes.windll.user32.RegisterHotKey(int(self.winId()), self.hotkey_deaf_id, 0x0006, 0x44)  # Ctrl+Shift+D

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
            self.clip_catcher.set_game(g)

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

    def on_feature_permission(self, origin, feature):
        if same_origin(origin):
            self.page.setFeaturePermission(origin, feature, QWebEnginePage.PermissionPolicy.PermissionGrantedByUser)

    def on_permission(self, perm):
        if same_origin(perm.origin()):
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

    def nativeEvent(self, event_type, message):
        if os.name == "nt":
            try:
                import ctypes.wintypes
                msg = ctypes.wintypes.MSG.from_address(int(message))
                if msg.message == 0x0312:  # WM_HOTKEY
                    if msg.wParam == 1088:
                        self.clip_catcher.capture()
                        return True, 0
                    elif msg.wParam == 1089:
                        self.page.runJavaScript("if (window.TWVoice) TWVoice.toggleMute();")
                        return True, 0
                    elif msg.wParam == 1090:
                        self.page.runJavaScript("if (window.TWVoice) TWVoice.toggleDeafen();")
                        return True, 0
            except Exception:
                pass
        return super().nativeEvent(event_type, message)

    def closeEvent(self, e):
        self.settings.setValue("geometry", self.saveGeometry())
        self.tray.hide()   # no ghost icon left in the notification area
        try:
            self.clip_catcher.stop()
        except Exception:
            pass
        if os.name == "nt":
            for hid in (getattr(self, "hotkey_clip_id", None), getattr(self, "hotkey_mute_id", None), getattr(self, "hotkey_deaf_id", None)):
                if hid:
                    try:
                        ctypes.windll.user32.UnregisterHotKey(int(self.winId()), hid)
                    except Exception:
                        pass
        self.stop_server()
        super().closeEvent(e)


def main():
    if os.name == "nt":
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ThirdWheel.Desktop")
    # The hosted server is often plain http (no certificate). Browsers only allow the microphone on secure pages, so treat the app's own
    # server address as secure for voice messages. Only that one address; every other site keeps the normal rules.
    flags = [
        "--autoplay-policy=no-user-gesture-required",
        "--enable-features=WebRTCPeerConnectionWithContext",
    ]
    if HOST_URL.startswith("http://"):
        flags.append("--unsafely-treat-insecure-origin-as-secure=" + HOST_URL.rstrip("/"))
    curr_flags = os.environ.get("QTWEBENGINE_CHROMIUM_FLAGS", "")
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = (curr_flags + " " + " ".join(flags)).strip()
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
