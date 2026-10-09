import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


class Control:
    def __init__(self):
        self.visible = True
        self.text = ""
        self.items = []
        self.model = self

    def setVisible(self, visible):
        self.visible = visible

    def setText(self, text):
        self.text = text

    def getText(self):
        return self.text

    def setPosSize(self, *args):
        pass

    def getItemCount(self):
        return len(self.items)

    def removeItems(self, position, count):
        self.items.clear()

    def addItems(self, items, position):
        self.items.extend(items)


class SidebarStateTest(unittest.TestCase):
    def test_authentication_transitions_hide_unavailable_actions_and_clear_results(self):
        modules = {}
        for name in ("unohelper", "com", "com.sun", "com.sun.star", "com.sun.star.awt", "com.sun.star.container", "com.sun.star.ui"):
            modules[name] = types.ModuleType(name)
        modules["unohelper"].Base = type("UnoBase", (), {})
        modules["unohelper"].ImplementationHelper = lambda: types.SimpleNamespace(addImplementation=lambda *args: None)
        for name in ("XActionListener", "XCallback"):
            setattr(modules["com.sun.star.awt"], name, type(name, (), {}))
        modules["com.sun.star.container"].NoSuchElementException = type("NoSuchElementException", (Exception,), {})
        for name in ("XSidebarPanel", "XToolPanel", "XUIElement", "XUIElementFactory"):
            setattr(modules["com.sun.star.ui"], name, type(name, (), {}))
        modules["com.sun.star.ui"].LayoutSize = lambda *args: args
        path = Path(__file__).resolve().parents[1] / "writer" / "sidebar.py"
        with patch.dict(sys.modules, modules):
            spec = importlib.util.spec_from_file_location("writer_sidebar_state_test", path)
            sidebar = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(sidebar)

        panel = sidebar.MendeleyPanel.__new__(sidebar.MendeleyPanel)
        panel.intro = Control()
        panel.connect_button = Control()
        panel.web_login_button = Control()
        panel.status_text = Control()
        panel.search_field = Control()
        panel.search_button = Control()
        panel.results = Control()
        panel.logout_button = Control()
        panel.oauth_generation = 0
        panel.callback = types.SimpleNamespace(addCallback=lambda callback, value: callback.notify(value))
        panel.panel_callback = sidebar.PanelCallback(panel)

        panel._set_logged_in(False)
        panel._show_status("Preparing sign-in")
        self.assertEqual(panel.status_text.text, "Preparing sign-in")
        self.assertTrue(panel.connect_button.visible)
        self.assertFalse(panel.search_field.visible)

        panel.apply_result(("desktop_login", {"status": "ok", "token": "private"}, 0))
        self.assertFalse(panel.connect_button.visible)
        self.assertFalse(panel.intro.visible)
        self.assertTrue(panel.search_field.visible)
        panel.search_field.setText("Ada")
        panel.apply_result(("search", {"status": "ok", "items": [{"title": "Analytical Engine", "authors": ["Ada Lovelace"], "year": "1843"}]}, 0))
        self.assertEqual(panel.results.items, ["Analytical Engine — Ada Lovelace (1843)"])

        panel.apply_result(("search", {"status": "unauthorized"}, 0))
        self.assertTrue(panel.connect_button.visible)
        self.assertFalse(panel.search_field.visible)
        self.assertEqual(panel.search_field.text, "")
        panel.access_token = None
        panel._run_worker = lambda *args, **kwargs: {"status": "ok", "url": "https://api.mendeley.com/oauth/authorize"}
        opened = []
        panel._open_oauth = lambda url, generation: opened.append((url, generation))
        panel.callback.addCallback = lambda *args: self.fail("OAuth launch must not wait for the UNO callback")
        panel._worker_action("begin_oauth", generation=0)
        self.assertEqual(opened, [("https://api.mendeley.com/oauth/authorize", 0)])
        started = []

        class ThreadStub:
            def __init__(self, target, args, daemon):
                self.args = args

            def start(self):
                started.append(self.args)

        def fail_callback(*args):
            raise RuntimeError("UNO callback unavailable")

        panel.callback.addCallback = fail_callback
        with patch.object(sidebar.threading, "Thread", ThreadStub):
            with self.assertRaisesRegex(RuntimeError, "UNO callback unavailable"):
                panel.handle_action("webLogin")
        self.assertEqual(started, [("begin_oauth", None, 1)])
        self.assertEqual(panel.results.items, [])


if __name__ == "__main__":
    unittest.main()
