import json
import os
import subprocess
import sys
import threading

import unohelper
from com.sun.star.awt import XCallback
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


class StatusCallback(unohelper.Base, XCallback):
    def __init__(self, panel):
        self.panel = panel

    def notify(self, result):
        self.panel.show_status(result)


class MendeleyPanel(unohelper.Base, XSidebarPanel, XToolPanel, XUIElement):
    def __init__(self, context, parent, frame, resource_url):
        self.context = context
        self.parent = parent
        self.Frame = frame
        self.ResourceURL = resource_url
        self.status_text = None
        self.container = self._create_panel()
        self.callback = self.context.ServiceManager.createInstanceWithContext("com.sun.star.awt.AsyncCallback", self.context)
        self.status_callback = StatusCallback(self)
        log_event("info", "writer.worker.starting")
        threading.Thread(target=self._check_worker, daemon=True).start()

    def _create_panel(self):
        manager = self.context.ServiceManager
        toolkit = manager.createInstanceWithContext("com.sun.star.awt.Toolkit", self.context)
        container = manager.createInstanceWithContext("com.sun.star.awt.UnoControlContainer", self.context)
        model = manager.createInstanceWithContext("com.sun.star.awt.UnoControlContainerModel", self.context)
        container.setModel(model)
        container.createPeer(toolkit, self.parent)

        label = manager.createInstanceWithContext("com.sun.star.awt.UnoControlFixedText", self.context)
        label_model = manager.createInstanceWithContext("com.sun.star.awt.UnoControlFixedTextModel", self.context)
        label.setModel(label_model)
        label.setPosSize(8, 8, 224, 80, 15)
        label_model.setPropertyValue("Label", "Starting Mendeley worker…")
        label_model.setPropertyValue("MultiLine", True)
        container.addControl("workerStatus", label)
        self.status_text = label
        return container

    def _check_worker(self):
        extension_root = os.path.dirname(os.path.abspath(__file__))
        node = os.path.join(extension_root, "runtime", "node", "bin", "node")
        worker = os.path.join(extension_root, "worker.js")
        try:
            os.chmod(node, 0o755)
            log_event("debug", "writer.worker.executable_ready")
            result = subprocess.run(
                [node, worker],
                input='{"command":"status"}\n',
                text=True,
                capture_output=True,
                timeout=5,
                check=True,
            )
            for line in result.stderr.splitlines():
                print(line, file=sys.stderr, flush=True)
            response = json.loads(result.stdout.splitlines()[0])
            if response != {"status": "ok", "service": "mendeley-writer-worker"}:
                raise RuntimeError("Worker returned unexpected status")
            message = "Mendeley worker ready."
            log_event("success", "writer.worker.ready")
        except Exception as error:
            message = "Mendeley worker unavailable. Reinstall extension or restore bundled Node.js."
            log_event("error", "writer.worker.unavailable", {"error": str(error), "node": node})

        self.callback.addCallback(self.status_callback, message)

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
        return LayoutSize(96, 96, 96)

    def dispose(self):
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
