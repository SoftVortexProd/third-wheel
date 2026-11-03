"""Third Wheel desktop shell: starts the bundled C# server and shows the web UI."""
import atexit
import ctypes
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

from PySide6.QtCore import QSettings, QTimer, QUrl, Qt
from PySide6.QtGui import QColor, QDesktopServices, QIcon, QPalette
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QLabel, QMainWindow, QStackedWidget

HOST_URL = "http://127.0.0.1:5173"
BG = "#0f1115"
ACCENT = "#7c8cff"
MUTED = "#8b93a7"


def base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent


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
        with urllib.request.urlopen(HOST_URL + "/api/meta", timeout=1) as r:
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


class Page(QWebEnginePage):
    def acceptNavigationRequest(self, url, nav_type, is_main):
        if url.scheme() in ("about", "blob", "data") or url.toString().startswith(HOST_URL):
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

    def setIcon(self):
        for p in (resource("app.ico"), base_dir() / "app.ico"):
            if p.exists():
                self.setWindowIcon(QIcon(str(p)))
                return

    def start_server(self):
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
        elif self.tries > 100:
            self.timer.stop()
            self.splash.setText("Third Wheel\n\nServer did not respond.")

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
