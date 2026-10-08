/**
 * DocumentModule and Adapters for ONLYOFFICE Citation Management
 */
(function (root, factory) {
    if (typeof exports === "object" && typeof module === "object") {
        module.exports = factory();
    } else if (typeof define === "function" && define.amd) {
        define([], factory);
    } else {
        var exp = factory();
        root.DocumentModule = exp.DocumentModule;
        root.OnlyOfficeAdapter = exp.OnlyOfficeAdapter;
        root.InMemoryAdapter = exp.InMemoryAdapter;
    }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

    function log(level, event, data) {
        var payload = {
            timestamp: new Date().toISOString(),
            level: level,
            event: event,
            data: data || {}
        };
        try {
            console.log(JSON.stringify(payload));
        } catch (e) {
            console.log(level + ": " + event);
        }
    }

    function encodeBase64(str) {
        if (typeof Buffer !== "undefined") {
            return Buffer.from(str, "utf8").toString("base64");
        }
        return btoa(unescape(encodeURIComponent(str)));
    }

    function decodeBase64(b64) {
        if (typeof Buffer !== "undefined") {
            return Buffer.from(b64, "base64").toString("utf8");
        }
        return decodeURIComponent(escape(atob(b64)));
    }

    var TAG_PREFIX = "MENDELEY_CITATION_v3_";
    var BIB_TAG = "MENDELEY_BIBLIOGRAPHY";

    function InMemoryAdapter() {
        this.controls = [];
        this.nextId = 1;
        this.footnotesCount = 0;
    }

    InMemoryAdapter.prototype.getAllContentControls = function () {
        var list = this.controls.map(function (c) {
            return {
                InternalId: c.internalId,
                Tag: c.tag
            };
        });
        log("debug", "InMemoryAdapter.getAllContentControls", { count: list.length });
        return Promise.resolve(list);
    };

    InMemoryAdapter.prototype.addAddinField = function (field) {
        var rawTag = field.Value || "";
        var tag = rawTag.replace(/^ITEM /, "");
        var control = {
            internalId: "inmem_ctrl_" + this.nextId++,
            tag: tag,
            text: field.Content || "",
            html: field.Content || ""
        };
        this.controls.push(control);
        log("info", "InMemoryAdapter.addAddinField", { internalId: control.internalId, tag: tag });
        return Promise.resolve(control.internalId);
    };

    InMemoryAdapter.prototype.addFootnote = function () {
        this.footnotesCount++;
        log("debug", "InMemoryAdapter.addFootnote", { totalFootnotes: this.footnotesCount });
        return Promise.resolve();
    };

    InMemoryAdapter.prototype.updateControlText = function (internalId, text) {
        for (var i = 0; i < this.controls.length; i++) {
            if (this.controls[i].internalId === internalId) {
                this.controls[i].text = text;
                log("info", "InMemoryAdapter.updateControlText", { internalId: internalId, length: text.length });
                return Promise.resolve();
            }
        }
        log("warn", "InMemoryAdapter.updateControlText.notFound", { internalId: internalId });
        return Promise.resolve();
    };

    InMemoryAdapter.prototype.updateControlHtml = function (internalId, html) {
        for (var i = 0; i < this.controls.length; i++) {
            if (this.controls[i].internalId === internalId) {
                this.controls[i].html = html;
                log("info", "InMemoryAdapter.updateControlHtml", { internalId: internalId, length: html.length });
                return Promise.resolve();
            }
        }
        log("warn", "InMemoryAdapter.updateControlHtml.notFound", { internalId: internalId });
        return Promise.resolve();
    };

    InMemoryAdapter.prototype.removeContentControl = function (internalId) {
        var beforeLen = this.controls.length;
        this.controls = this.controls.filter(function (c) {
            return c.internalId !== internalId;
        });
        log("info", "InMemoryAdapter.removeContentControl", { internalId: internalId, removed: beforeLen !== this.controls.length });
        return Promise.resolve();
    };

    function OnlyOfficeAdapter() {}

    OnlyOfficeAdapter.prototype.getAllContentControls = function () {
        return new Promise(function (resolve) {
            if (typeof window === "undefined" || !window.Asc || !window.Asc.plugin) {
                log("error", "OnlyOfficeAdapter.missingPlugin", {});
                resolve([]);
                return;
            }
            window.Asc.plugin.executeMethod("GetAllContentControls", [], function (controls) {
                log("debug", "OnlyOfficeAdapter.getAllContentControls", { count: (controls || []).length });
                resolve(controls || []);
            });
        });
    };

    OnlyOfficeAdapter.prototype.addAddinField = function (field) {
        return new Promise(function (resolve) {
            if (typeof window === "undefined" || !window.Asc || !window.Asc.plugin) {
                log("error", "OnlyOfficeAdapter.missingPlugin", {});
                resolve("");
                return;
            }
            window.Asc.plugin.executeMethod("AddAddinField", [field], function (res) {
                log("info", "OnlyOfficeAdapter.addAddinField", { value: field.Value });
                resolve(res || "");
            });
        });
    };

    OnlyOfficeAdapter.prototype.addFootnote = function () {
        return new Promise(function (resolve) {
            if (typeof window === "undefined" || !window.Asc || !window.Asc.plugin) {
                resolve();
                return;
            }
            window.Asc.plugin.callCommand(function () {
                var oDoc = Api.GetDocument();
                oDoc.AddFootnote();
            }, false, true, function () {
                log("debug", "OnlyOfficeAdapter.addFootnote", {});
                resolve();
            });
        });
    };

    OnlyOfficeAdapter.prototype.updateControlText = function (internalId, text) {
        return new Promise(function (resolve) {
            if (typeof window === "undefined" || !window.Asc || !window.Asc.plugin) {
                resolve();
                return;
            }
            window.Asc.plugin.callCommand(function () {
                var oDoc = Api.GetDocument();
                var aControls = oDoc.GetAllContentControls();
                for (var i = 0; i < aControls.length; i++) {
                    if (aControls[i].GetInternalId() === Asc.scope.ctrlId) {
                        aControls[i].GetRange().Delete();
                        aControls[i].GetRange().AddText(Asc.scope.cleanText);
                    }
                }
            }, false, true, function () {
                log("info", "OnlyOfficeAdapter.updateControlText", { internalId: internalId });
                resolve();
            }, { ctrlId: internalId, cleanText: text });
        });
    };

    OnlyOfficeAdapter.prototype.updateControlHtml = function (internalId, html) {
        return new Promise(function (resolve) {
            if (typeof window === "undefined" || !window.Asc || !window.Asc.plugin) {
                resolve();
                return;
            }
            window.Asc.plugin.callCommand(function () {
                var oDoc = Api.GetDocument();
                var aControls = oDoc.GetAllContentControls();
                for (var i = 0; i < aControls.length; i++) {
                    if (aControls[i].GetInternalId() === Asc.scope.ctrlId) {
                        aControls[i].GetRange().Delete();
                        aControls[i].GetRange().PasteHtml(Asc.scope.rawHtml);
                    }
                }
            }, false, true, function () {
                log("info", "OnlyOfficeAdapter.updateControlHtml", { internalId: internalId });
                resolve();
            }, { ctrlId: internalId, rawHtml: html });
        });
    };

    OnlyOfficeAdapter.prototype.removeContentControl = function (internalId) {
        return new Promise(function (resolve) {
            if (typeof window === "undefined" || !window.Asc || !window.Asc.plugin) {
                resolve();
                return;
            }
            window.Asc.plugin.executeMethod("RemoveContentControl", [internalId], function () {
                log("info", "OnlyOfficeAdapter.removeContentControl", { internalId: internalId });
                resolve();
            });
        });
    };

    function DocumentModule(adapter) {
        if (!adapter) {
            if (typeof window !== "undefined" && window.Asc && window.Asc.plugin) {
                this.adapter = new OnlyOfficeAdapter();
            } else {
                this.adapter = new InMemoryAdapter();
            }
        } else {
            this.adapter = adapter;
        }
    }

    DocumentModule.prototype.insertCitation = function (citationItems, renderedText, isNoteStyle) {
        var cleanText = String(renderedText || "").replace(/<[^>]+>/g, "");
        var citationObj = {
            citationId: "CITATION_" + new Date().getTime(),
            citationItems: citationItems,
            schema: "https://github.com/citation-style-language/schema/raw/master/csl-citation.json",
            isNoteStyle: !!isNoteStyle
        };
        var base64Tag = TAG_PREFIX + encodeBase64(JSON.stringify(citationObj));
        var addinField = {
            FieldId: "",
            Value: "ITEM " + base64Tag,
            Content: cleanText
        };

        var self = this;
        var op = isNoteStyle ? self.adapter.addFootnote() : Promise.resolve();

        return op.then(function () {
            return self.adapter.addAddinField(addinField);
        }).then(function (result) {
            log("success", "DocumentModule.insertCitation", { citationId: citationObj.citationId, isNoteStyle: !!isNoteStyle });
            return result;
        });
    };

    // ONLYOFFICE stores field.Value (e.g. "ITEM MENDELEY_CITATION_v3_...") as ctrl.Tag.
    // Strip the "ITEM " prefix so tag comparisons work consistently.
    function normalizeTag(raw) {
        return (raw || "").replace(/^ITEM /, "");
    }

    DocumentModule.prototype.getCitations = function () {
        return this.adapter.getAllContentControls().then(function (controls) {
            var records = [];
            if (!controls || !controls.length) return records;

            for (var i = 0; i < controls.length; i++) {
                var ctrl = controls[i];
                var tag = normalizeTag(ctrl.Tag);
                if (tag.indexOf(TAG_PREFIX) === 0) {
                    try {
                        var b64 = tag.substring(TAG_PREFIX.length);
                        var payload = JSON.parse(decodeBase64(b64));
                        if (payload && payload.citationItems) {
                            records.push({
                                internalId: ctrl.InternalId,
                                citationId: payload.citationId,
                                citationItems: payload.citationItems,
                                isNoteStyle: !!payload.isNoteStyle
                            });
                        }
                    } catch (err) {
                        log("error", "DocumentModule.getCitations.parseError", { internalId: ctrl.InternalId, error: err.message });
                    }
                }
            }
            log("debug", "DocumentModule.getCitations", { totalFound: records.length });
            return records;
        });
    };

    DocumentModule.prototype.updateCitationText = function (internalId, renderedText) {
        var cleanText = String(renderedText || "").replace(/<[^>]+>/g, "");
        return this.adapter.updateControlText(internalId, cleanText).then(function () {
            log("success", "DocumentModule.updateCitationText", { internalId: internalId });
        });
    };

    DocumentModule.prototype.insertBibliography = function (html) {
        var rawHtml = (html && html.join) ? html.join("") : String(html || "");
        var addinBibField = {
            FieldId: "",
            Value: "ITEM " + BIB_TAG,
            Content: rawHtml
        };
        return this.adapter.addAddinField(addinBibField).then(function (res) {
            log("success", "DocumentModule.insertBibliography", {});
            return res;
        });
    };

    DocumentModule.prototype.getBibliography = function () {
        return this.adapter.getAllContentControls().then(function (controls) {
            if (!controls || !controls.length) return null;
            for (var i = 0; i < controls.length; i++) {
                var ctrl = controls[i];
                var tag = normalizeTag(ctrl.Tag);
                if (tag === BIB_TAG) {
                    log("debug", "DocumentModule.getBibliography.found", { internalId: ctrl.InternalId });
                    return { internalId: ctrl.InternalId };
                }
            }
            log("debug", "DocumentModule.getBibliography.notFound", {});
            return null;
        });
    };

    DocumentModule.prototype.updateBibliographyHtml = function (internalId, html) {
        var rawHtml = (html && html.join) ? html.join("") : String(html || "");
        return this.adapter.updateControlHtml(internalId, rawHtml).then(function () {
            log("success", "DocumentModule.updateBibliographyHtml", { internalId: internalId });
        });
    };

    DocumentModule.prototype.unlinkAll = function () {
        var self = this;
        return this.adapter.getAllContentControls().then(function (controls) {
            if (!controls || !controls.length) return;
            var removalPromises = [];
            for (var i = 0; i < controls.length; i++) {
                var ctrl = controls[i];
                var tag = normalizeTag(ctrl.Tag);
                if (tag.indexOf(TAG_PREFIX) === 0 || tag === BIB_TAG || tag.indexOf("MENDELEY_CITATION_") === 0) {
                    removalPromises.push(self.adapter.removeContentControl(ctrl.InternalId));
                }
            }
            return Promise.all(removalPromises).then(function () {
                log("success", "DocumentModule.unlinkAll", { totalRemoved: removalPromises.length });
            });
        });
    };

    return {
        DocumentModule: DocumentModule,
        OnlyOfficeAdapter: OnlyOfficeAdapter,
        InMemoryAdapter: InMemoryAdapter
    };
});
