import json
import os
import subprocess
import sys
import threading
import time
import webbrowser

import unohelper
from com.sun.star.awt import XActionListener, XCallback
from com.sun.star.container import NoSuchElementException
from com.sun.star.ui import LayoutSize, XSidebarPanel, XToolPanel, XUIElement, XUIElementFactory

FACTORY_NAME = "org.nashirabbash.mendeley.WriterSidebarFactory"
FACTORY_SERVICE = "com.sun.star.ui.UIElementFactory"
PANEL_URL = "private:resource/toolpanel/MendeleyWriterFactory/MendeleyWriterPanel"


def log_event(level, event, data=None):
    record = {"level": level, "event": event}
    if data:
        record["data"] = data
    print(json.dumps(record), file=sys.stderr, flush=True)


class PanelCallback(unohelper.Base, XCallback):
    def __init__(self, panel):
        self.panel = panel

    def notify(self, result):
        self.panel.apply_result(result)


class PanelActionListener(unohelper.Base, XActionListener):
    def __init__(self, panel):
        self.panel = panel

    def actionPerformed(self, event):
        self.panel.handle_action(event.ActionCommand)

    def disposing(self, event):
        pass


class MendeleyPanel(unohelper.Base, XSidebarPanel, XToolPanel, XUIElement):
    def __init__(self, context, parent, frame, resource_url):
        self.context = context
        self.parent = parent
        self.Frame = frame
        self.ResourceURL = resource_url
        self.access_token = None
        self.oauth_generation = 0
        self.callback = context.ServiceManager.createInstanceWithContext("com.sun.star.awt.AsyncCallback", context)
        self.panel_callback = PanelCallback(self)
        self.action_listener = PanelActionListener(self)
        self.container = self._create_panel()
        self._start_loopback_server()
        log_event("info", "writer.panel.ready")
        threading.Thread(target=self._check_worker, daemon=True).start()

    def _create_panel(self):
        manager = self.context.ServiceManager
        toolkit = manager.createInstanceWithContext("com.sun.star.awt.Toolkit", self.context)
        container = manager.createInstanceWithContext("com.sun.star.awt.UnoControlContainer", self.context)
        model = manager.createInstanceWithContext("com.sun.star.awt.UnoControlContainerModel", self.context)
        container.setModel(model)
        container.createPeer(toolkit, self.parent)

        label = self._add_control(manager, container, "status", "com.sun.star.awt.UnoControlFixedText", 8, 8, 224, 32)
        label.getModel().setPropertyValue("Label", "Connect Mendeley Desktop to search your library.")
        label.getModel().setPropertyValue("MultiLine", True)
        self.status_text = label

        self._add_button(manager, container, "connect", "Connect to Mendeley Desktop", 8, 44, 224, 28)
        self._add_button(manager, container, "webLogin", "Login to Mendeley (Web)", 8, 78, 224, 28)
        self.search_field = self._add_control(manager, container, "searchField", "com.sun.star.awt.UnoControlEdit", 8, 112, 224, 28)
        self.search_field.getModel().setPropertyValue("Text", "")
        self._add_button(manager, container, "search", "Search title, author, or year", 8, 148, 224, 28)
        self.results = self._add_control(manager, container, "results", "com.sun.star.awt.UnoControlListBox", 8, 184, 224, 200)
        self._add_button(manager, container, "logout", "Log out", 8, 392, 224, 28)
        return container

    def _add_control(self, manager, container, name, service, x, y, width, height):
        control = manager.createInstanceWithContext(service, self.context)
        model = manager.createInstanceWithContext(service + "Model", self.context)
        control.setModel(model)
        control.setPosSize(x, y, width, height, 15)
        container.addControl(name, control)
        return control

    def _add_button(self, manager, container, command, label, x, y, width, height):
        button = self._add_control(manager, container, command, "com.sun.star.awt.UnoControlButton", x, y, width, height)
        button.getModel().setPropertyValue("Label", label)
        button.setActionCommand(command)
        button.addActionListener(self.action_listener)
        return button

    def _start_loopback_server(self):
        helper = os.path.join(os.path.dirname(os.path.abspath(__file__)), "loopback-server.py")
        try:
            subprocess.Popen(
                [sys.executable, helper],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True,
            )
            log_event("info", "writer.oauth.loopback_starting")
        except Exception as error:
            log_event("error", "writer.oauth.loopback_unavailable", {"error": str(error)})

    def _check_worker(self):
        try:
            result = self._run_worker({"command": "status"})
            if result != {"status": "ok", "service": "mendeley-writer-worker"}:
                raise RuntimeError("Worker returned unexpected status")
            self._show_status("Connect Mendeley Desktop to search your library.")
            log_event("success", "writer.worker.ready")
        except Exception as error:
            self._show_status("Mendeley worker unavailable. Reinstall extension or restore bundled Node.js.")
            log_event("error", "writer.worker.unavailable", {"error": str(error)})

    def _run_worker(self, request, token=None, query=None):
        extension_root = os.path.dirname(os.path.abspath(__file__))
        node = os.path.join(extension_root, "runtime", "node", "bin", "node")
        worker = os.path.join(extension_root, "worker.js")
        payload = dict(request)
        if payload.get("command") == "search":
            payload["token"] = token
            payload["query"] = query
        result = subprocess.run(
            [node, worker],
            input=json.dumps(payload) + "\n",
            text=True,
            capture_output=True,
            timeout=20,
            check=True,
        )
        for line in result.stderr.splitlines():
            print(line, file=sys.stderr, flush=True)
        responses = result.stdout.splitlines()
        if not responses:
            raise RuntimeError("Mendeley worker returned no response.")
        return json.loads(responses[-1])

    def handle_action(self, command):
        log_event("info", "writer.panel.action", {"command": command})
        if command == "connect":
            self.oauth_generation += 1
            generation = self.oauth_generation
            self._show_status("Checking Mendeley Desktop session…")
            threading.Thread(target=self._worker_action, args=("desktop_login", None, generation), daemon=True).start()
        elif command == "webLogin":
            self.oauth_generation += 1
            generation = self.oauth_generation
            self._show_status("Preparing secure browser sign-in…")
            threading.Thread(target=self._worker_action, args=("begin_oauth", None, generation), daemon=True).start()
        elif command == "search":
            query = self.search_field.getText().strip()
            if not self.access_token:
                self._show_status("Connect to Mendeley first.")
                return
            if not query:
                self._show_status("Enter a title, author, or year.")
                return
            self._show_status("Searching Mendeley library…")
            threading.Thread(target=self._worker_action, args=(command, query, self.oauth_generation), daemon=True).start()
        elif command == "logout":
            self.oauth_generation += 1
            self.access_token = None
            self._replace_results([])
            self._show_status("Logged out.")
            threading.Thread(target=self._worker_action, args=(command, None, self.oauth_generation), daemon=True).start()

    def _worker_action(self, command, query=None, generation=None):
        if generation is None:
            generation = self.oauth_generation
        try:
            result = self._run_worker(
                {"command": command},
                token=self.access_token,
                query=query,
            )
            self.callback.addCallback(self.panel_callback, (command, result, generation))
        except Exception as error:
            log_event("error", "writer.worker.request_failed", {"command": command, "error": str(error)})
            self.callback.addCallback(self.panel_callback, (command, {"status": "error", "error": "Mendeley request failed. Check your network and try again."}, generation))

    def _poll_oauth(self, generation):
        for attempt in range(300):
            if generation != self.oauth_generation:
                return
            try:
                result = self._run_worker({"command": "oauth_token"})
                if result.get("status") == "ok":
                    self.callback.addCallback(self.panel_callback, ("oauth_token", result, generation))
                    return
            except Exception as error:
                log_event("error", "writer.oauth.poll_failed", {"error": str(error)})
                self.callback.addCallback(self.panel_callback, ("oauth_error", {}, generation))
                return
            time.sleep(1)
        self.callback.addCallback(self.panel_callback, ("oauth_error", {}, generation))

    def _open_oauth(self, url, generation):
        threading.Thread(target=self._launch_oauth, args=(url, generation), daemon=True).start()

    def _launch_oauth(self, url, generation):
        try:
            if not webbrowser.open(url):
                raise RuntimeError("No browser could open Mendeley sign-in.")
            self._show_status("Complete sign-in in your browser. Waiting for Mendeley…")
            threading.Thread(target=self._poll_oauth, args=(generation,), daemon=True).start()
        except Exception as error:
            log_event("error", "writer.oauth.browser_failed", {"error": str(error)})
            self._show_status("Could not open browser. Check your default browser and try again.")

    def apply_result(self, payload):
        command, result = payload[:2]
        if len(payload) > 2 and payload[2] != self.oauth_generation:
            return
        if command == "status":
            self.show_status(result.get("message", ""))
            return
        if command == "begin_oauth":
            if result.get("status") != "ok":
                self._show_status(result.get("error", "Could not start Mendeley sign-in."))
                return
            self._open_oauth(result["url"], payload[2])
        elif command == "oauth_token" and result.get("status") == "ok":
            self.access_token = result.get("token")
            self._show_status("Connected. Search by title, author, or year.")
        elif command == "oauth_error":
            self._show_status("Mendeley sign-in failed or expired. Try again.")
        elif result.get("status") == "unauthorized":
            self.access_token = None
            self._replace_results([])
            self._show_status("Mendeley session expired. Connect again.")
        elif result.get("status") == "pending":
            return
        elif result.get("status") != "ok":
            self._show_status(result.get("error", "Mendeley request failed."))
        elif command == "desktop_login":
            self.access_token = result.get("token")
            self._show_status("Connected. Search by title, author, or year.")
        elif command == "search":
            self._replace_results(result.get("items", []))
            count = len(result.get("items", []))
            self._show_status("{} references found.".format(count))
        elif command == "logout":
            self._show_status("Logged out.")


    def _replace_results(self, items):
        self.results.removeItems(0, self.results.getItemCount())
        if items:
            labels = [
                "{} — {}{}".format(
                    item.get("title", "Untitled"),
                    ", ".join(item.get("authors", [])) or "Unknown author",
                    " ({})".format(item.get("year")) if item.get("year") else "",
                )
                for item in items
            ]
            self.results.addItems(tuple(labels), 0)

    def _show_status(self, message):
        self.callback.addCallback(self.panel_callback, ("status", {"message": message}))

    def show_status(self, message):
        if self.status_text is not None:
            self.status_text.setText(message)

    def getRealInterface(self):
        return self

    def createAccessible(self, parent):
        return self

    @property
    def Window(self):
        return self.container

    def getMinimalWidth(self):
        return 240

    def getHeightForWidth(self, width):
        return LayoutSize(432, 432, 432)

    def dispose(self):
        self.oauth_generation += 1
        self.access_token = None
        self.status_text = None
        self.container.dispose()


class MendeleyWriterFactory(unohelper.Base, XUIElementFactory):
    def __init__(self, context):
        self.context = context

    def createUIElement(self, resource_url, properties):
        if resource_url != PANEL_URL:
            raise NoSuchElementException(resource_url, self)

        frame = None
        parent = None
        for property_value in properties:
            if property_value.Name == "Frame":
                frame = property_value.Value
            elif property_value.Name == "ParentWindow":
                parent = property_value.Value
        if frame is None or parent is None:
            raise RuntimeError("Sidebar frame and parent window are required")
        return MendeleyPanel(self.context, parent, frame, resource_url)


g_ImplementationHelper = unohelper.ImplementationHelper()
g_ImplementationHelper.addImplementation(MendeleyWriterFactory, FACTORY_NAME, (FACTORY_SERVICE,))
