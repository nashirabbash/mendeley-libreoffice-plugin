/**
 *
 * (c) Copyright Ascensio System SIA 2020
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
(function () {
    var displayNoneClass = "display-none";
    var blurClass = "blur";
    var waitForLoad = false;

    var selected = {
        items: {},
        html: {},
        checks: {},
        count: function () {
            var k = 0;
            for (var i in selected.items) k++;
            return k;
        }
    };

    var defaultStyles = 
    {
        "American Medical Association 11th edition" : 1, "American Political Science Association" : 1,
        "American Psychological Association 7th edition" : 1, "American Sociological Association 6th edition" : 1,
        "Chicago Manual of Style 17th edition (author-date)" : 1, "Cite Them Right 10th edition - Harvard" : 1,
        "IEEE" : 1, "Modern Humanities Research Association 3rd edition (note with bibliography)" : 1,
        "Modern Language Association 8th edition" : 1, "Nature" : 1
    };

    var locales = {};
    var styles = {};
    var selectedLocale = "en-US";
    var selectedStyle = localStorage.getItem("mendStyleId") || "apa";
    var sdk = null;
    var documentModule = new DocumentModule();
    var loginStateHash = null;

    var redirectUrl;
    var mendAppId;

    var authFlow = {
        authenticate: function () {
            localStorage.removeItem("mendToken");
            window._activeMendToken = null;
            showLoader(true);

            loginStateHash = new Date().getTime();
            var appId = mendAppId || getSettings() || "26014";

            var link = "https://api.mendeley.com/oauth/authorize?client_id=" + appId + "&redirect_uri=" + encodeURI(redirectUrl) + "&response_type=token&scope=all&state=" + loginStateHash;
            if (window.Asc.plugin.mendeley && window.Asc.plugin.mendeley.auth) {
                link = window.Asc.plugin.mendeley.auth();
            }

            var wnd = null;
            try {
                wnd = window.open(link, null, "width=500,height=700");
            } catch (e) {}

            var timer = setInterval(function () {
                var savedToken = localStorage.getItem("mendToken");
                if (savedToken) {
                    clearInterval(timer);
                    window._activeMendToken = savedToken;
                    showLoader(false);
                    switchAuthState("main");
                    loadFilteredLibrary(false);
                    if (wnd && !wnd.closed) { try { wnd.close(); } catch(e) {} }
                    return;
                }
                // Poll local loopback server
                fetch("http://127.0.0.1:8080/token")
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (data && data.token) {
                            localStorage.setItem("mendToken", data.token);
                            window._activeMendToken = data.token;
                            clearInterval(timer);
                            showLoader(false);
                            switchAuthState("main");
                            loadFilteredLibrary(false);
                            if (wnd && !wnd.closed) { try { wnd.close(); } catch(e) {} }
                        }
                    })
                    .catch(function() {});
            }, 1000);
        },
        getToken: function () {
            var token = window._activeMendToken || localStorage.getItem("mendToken");
            return token;
        },
        refreshToken: function () {
            return false;
        }
    };

    var lastSearch = {
        text: "",
        catObj: null,
        ownObj: null,
    };
    var elements = {
        loader: document.getElementById("loader"),
        libLoader: document.getElementById("libLoader"),
        error: document.getElementById("errorWrapper"),

        contentHolder: document.getElementById("content"),
        docsWrapper: document.getElementById("docsWrapper"),
        docsHolder: document.getElementById("docsHolder"),
        docsThumb: document.getElementById("docsThumb"),
        configState: document.getElementById("configState"),
        redirectConfigUrl: document.getElementById("redirectConfig"),
        redirectUrlCopy: document.getElementById("redirectUrlCopy"),
        reconfigBtn: document.getElementById("reconfigBtn"),
        appIdConfigField: document.getElementById("appIdField"),
        saveConfigBtn: document.getElementById("saveConfigBtn"),

        loginState: document.getElementById("loginState"),

        mainState: document.getElementById("mainState"),
        logoutLink: document.getElementById("logoutLink"),

        loginBtn: document.getElementById("loginBtn"),

        selectedWrapper: document.getElementById("selectedWrapper"),
        selectedHolder: document.getElementById("selectedHolder"),
        selectedThumb: document.getElementById("selectedThumb"),
        buttonsWrapper: document.getElementById("buttonsWrapper"),

        searchLabel: document.getElementById("searchLabel"),
        searchClear: document.getElementById("searchClear"),
        searchField: document.getElementById("searchField"),

        styleWrapper: document.getElementById("styleWrapper"),
        styleSelectList: document.getElementById("styleSelectList"),
        styleSelectListOther: document.getElementById("styleSelectedListOther"),
        styleSelect: document.getElementById("styleSelect"),
        styleLang: document.getElementById("styleLang"),

        insertBibBtn: document.getElementById("insertBibBtn"),
        insertLinkBtn: document.getElementById("insertLinkBtn"),
        cancelBtn: document.getElementById("cancelBtn"),

        collectionDrawer: document.getElementById("collectionDrawer"),
        drawerBackBtn: document.getElementById("drawerBackBtn"),
        drawerListHolder: document.getElementById("drawerListHolder"),
        collectionSelectorBtn: document.getElementById("collectionSelectorBtn"),
        currentCollectionLabel: document.getElementById("currentCollectionLabel"),
    };

    var selectedScroller;
    var docsScroller;

    window.Asc.plugin.init = function () {
        sdk = MendeleySDK({
            authFlow: authFlow
        });

        // Preload default style and locale in background
        getStyle(selectedStyle).catch(function() {});
        getLocale(selectedLocale).catch(function() {});

        window.Asc.plugin.onTranslate = applyTranslations;
        window.Asc.plugin.onThemeChanged = function (theme) {
            if (!theme) return;
            if (typeof window.Asc.plugin.onThemeChangedBase === "function") {
                window.Asc.plugin.onThemeChangedBase(theme);
            }
            applyGlobalTheme(theme);
        };

        if (document.location.protocol === "file:") {
            redirectUrl = "http://localhost:8080/";
        } else {
            redirectUrl = document.location.protocol + "//" + document.location.host + document.location.pathname.replace("index.html", "oauth.html");
        }
        elements.redirectConfigUrl.value = redirectUrl;

        elements.redirectUrlCopy.onclick = function (e) {
            elements.redirectConfigUrl.select();
            document.execCommand("copy");
            window.open("https://dev.mendeley.com/myapps.html", '_blank');
        };

        elements.reconfigBtn.onclick = function (e) {
            clearSettings();
            switchAuthState('config');
        };

        elements.loginBtn.onclick = function (e) {
            if (e.target.classList.contains(displayNoneClass)) return true;
            authFlow.authenticate();
            return true;
        };
        if (elements.logoutLink) {
            elements.logoutLink.onclick = function (e) {
                if (e.target.classList.contains(displayNoneClass)) return true;
                localStorage.removeItem("mendToken");
                window._activeMendToken = null;
                clearLibrary();
                switchAuthState('login');
                return true;
            };
        }
        var currentFilter = {
            type: "all",
            id: null,
            label: "All References"
        };

        function applyFilter(filter) {
            currentFilter = filter;
            elements.currentCollectionLabel.textContent = filter.label;
            elements.searchField.value = "";
            lastSearch.text = "";
            clearLibrary();

            // Switch views
            elements.collectionDrawer.classList.add(displayNoneClass);
            elements.mainState.classList.remove(displayNoneClass);

            loadFilteredLibrary(false);
        }

        function loadFilteredLibrary(append) {
            var params = { limit: 50, view: "bib" };
            if (lastSearch.text) {
                params.query = lastSearch.text;
            }

            if (currentFilter.type === "favorites") {
                params.starred = true;
                loadLibrary(sdk.documents.list(params), append, true);
            } else if (currentFilter.type === "recently_added") {
                params.sort = "created";
                params.order = "desc";
                loadLibrary(sdk.documents.list(params), append, true);
            } else if (currentFilter.type === "group" && currentFilter.id) {
                params.group_id = currentFilter.id;
                loadLibrary(sdk.documents.list(params), append, true);
            } else if (currentFilter.type === "folder" && currentFilter.id) {
                params.folderId = currentFilter.id;
                loadLibrary(sdk.documents.list(params), append, true);
            } else {
                if (lastSearch.text) {
                    loadLibrary(sdk.documents.search(params), append, true);
                } else {
                    loadLibrary(sdk.documents.list(params), append, true);
                }
            }
        }

        function searchFor(text) {
            if (elements.mainState.classList.contains(displayNoneClass)) return;
            text = (text || "").trim();
            if (text == lastSearch.text) return;
            lastSearch.text = text;
            lastSearch.catObj = null;
            lastSearch.ownObj = null;

            clearLibrary();
            loadFilteredLibrary(false);
        };
        elements.searchField.onkeypress = function (e) {
            if (e.keyCode == 13) searchFor(e.target.value);
        };
        elements.searchField.onblur = function (e) {
            setTimeout(function () { searchFor(e.target.value); }, 500);
        };

        elements.searchField.onkeyup = function (e) {
            switchClass(elements.searchClear, displayNoneClass, !e.target.value);
        };
        elements.searchClear.onclick = function (e) {
            if (e.target.classList.contains(displayNoneClass)) return true;
            switchClass(elements.searchClear, displayNoneClass, true);
            elements.searchField.value = "";
            lastSearch.text = "";
            clearLibrary();
            return true;
        };

        elements.cancelBtn.onclick = function (e) {
            var ids = [];
            for (var id in selected.items) {
                ids.push(id);
            }
            for (var i = 0; i < ids.length; i++) {
                removeSelected(ids[i]);
            }
        };

        elements.saveConfigBtn.onclick = function (e) {
            var appid = elements.appIdConfigField.value.trim();
            if (appid) {
                saveSettings(appid);
                switchAuthState("login");
            } else {
                showError(getMessage("AppId is empty"));
            }
        };

        if (elements.insertBibBtn) elements.insertBibBtn.onclick = formatInsertBibliography;
        if (elements.insertLinkBtn) elements.insertLinkBtn.onclick = formatInsertLink;

        selectedScroller = initScrollBox(elements.selectedHolder, elements.selectedThumb);
        docsScroller = initScrollBox(elements.docsWrapper, null, checkDocsScroll);

        // Load full 10,000+ CSL styles from local inventory with fallback to Zotero API
        function processStylesList(json) {
            window._allStylesList = json;
            var lastStyle = getLastUsedStyle();
            var found = false;

            var onStyleSelect = function (f) {
                return function (ev) {
                    var sel = ev.target.getAttribute("data-value");
                    saveLastUsedStyle(sel);
                    f(ev);
                }
            }

            var openOtherStyleList = function (list) {
                return function (ev) {
                    elements.styleSelectListOther.style.width = (elements.styleWrapper.clientWidth - 2) + "px";
                    ev.stopPropagation();
                    openList(list);
                }
            }

            var onStyleSelectOther = function (list, other) {
                return function (ev) {
                    var tmpEl = list.removeChild(list.children[list.children.length - 2]);
                    var newEl = document.createElement("span");
                    newEl.setAttribute("data-value", tmpEl.getAttribute("data-value"));
                    newEl.textContent = tmpEl.textContent;
                    other.appendChild(newEl);
                    newEl.onclick = onStyleSelectOther(elements.styleSelectList, elements.styleSelectListOther);
                    tmpEl = other.removeChild(ev.target);
                    newEl = document.createElement("span");
                    newEl.setAttribute("data-value", tmpEl.getAttribute("data-value"));
                    newEl.textContent = tmpEl.textContent;
                    list.insertBefore(newEl, list.firstElementChild);
                    newEl.onclick = onStyleSelect(onClickListElement(elements.styleSelectList, elements.styleSelect));
                    var event = new Event("click");
                    newEl.dispatchEvent(event);
                    openList(null);
                }
            }
            for (var i = 0; i < json.length; i++) {
                if (json[i].dependent != 0 && json[i].dep != 0) continue;

                var el = document.createElement("span");
                el.setAttribute("data-value", json[i].name);
                el.textContent = json[i].title;
                if (defaultStyles[json[i].title] || json[i].name == lastStyle) {
                    if (json[i].name == lastStyle)
                        elements.styleSelectList.insertBefore(el, elements.styleSelectList.firstElementChild);
                    else
                        elements.styleSelectList.appendChild(el);

                    el.onclick = onStyleSelect(onClickListElement(elements.styleSelectList, elements.styleSelect));
                } else {
                    elements.styleSelectListOther.appendChild(el);
                    el.onclick = onStyleSelectOther(elements.styleSelectList, elements.styleSelectListOther);
                }
                if (json[i].name == lastStyle) {
                    el.setAttribute("selected", "");
                    selectInput(elements.styleSelect, el, elements.styleSelectList);
                    found = true;
                }
            }
            var other = document.createElement("span");
            other.textContent = "More Styles...";
            elements.styleSelectList.appendChild(other);
            other.onclick = openOtherStyleList(elements.styleSelectListOther);

            if (!found && elements.styleSelectList.children.length > 0) {
                var first = elements.styleSelectList.children[0];
                first.setAttribute("selected", "");
                selectInput(elements.styleSelect, first, elements.styleSelectList);
            }
        }

        fetch("./scripts/styles_inventory.json")
            .then(function(r) { return r.json(); })
            .then(processStylesList)
            .catch(function() {
                fetch("https://www.zotero.org/styles-files/styles.json")
                    .then(function (resp) { return resp.json(); })
                    .then(processStylesList)
                    .catch(function (err) { });
            });

        elements.styleSelect.onkeyup = function () {
            var input = elements.styleSelect;
            var filter = input.value.toLowerCase();
            var list = (elements.styleSelectList.classList.contains(displayNoneClass)) ? elements.styleSelectListOther : elements.styleSelectList;

            for (var i = 0; i < list.children.length; i++) {
                var text = list.children[i].textContent || list.children[i].innerText;
                var hide = true;
                if (!filter || text.toLowerCase().indexOf(filter) > -1) {
                    hide = false;
                }
                switchClass(list.children[i], displayNoneClass, hide);
            }
        }

        elements.styleSelect.onselectchange = function (inp, val) {
            selectedStyle = val;
            getStyle(val).then(function() {
                refreshDocumentCitations();
            }).catch(function () { });
        };
        elements.styleLang.onselectchange = function (inp, val) {
            getLocale(val).catch(function () { });
            selectedLocale = val;
        };

        initSelectBoxes();
        elements.styleSelectList.onopen = function () {
            elements.styleSelectList.style.width = (elements.styleWrapper.clientWidth - 2) + "px";
        }

        // Setup Collection Drawer Trigger & Back Navigation
        if (elements.collectionSelectorBtn) {
            elements.collectionSelectorBtn.onclick = function() {
                elements.mainState.classList.add(displayNoneClass);
                elements.collectionDrawer.classList.remove(displayNoneClass);
                renderCollectionDrawer();
            };
        }
        if (elements.drawerBackBtn) {
            elements.drawerBackBtn.onclick = function() {
                elements.collectionDrawer.classList.add(displayNoneClass);
                elements.mainState.classList.remove(displayNoneClass);
            };
        }

        // Setup Sync Button & More Menu
        var topSyncBtn = document.getElementById("topSyncBtn");
        if (topSyncBtn) {
            topSyncBtn.onclick = function() {
                loadFilteredLibrary(false);
                refreshDocumentCitations();
            };
        }

        var topMoreBtn = document.getElementById("topMoreBtn");
        var topMoreMenu = document.getElementById("topMoreMenu");
        if (topMoreBtn && topMoreMenu) {
            topMoreBtn.onclick = function(e) {
                e.stopPropagation();
                topMoreMenu.classList.toggle(displayNoneClass);
            };
            document.addEventListener("click", function() {
                topMoreMenu.classList.add(displayNoneClass);
            });
        }

        var menuBib = document.getElementById("menuItemInsertBib");
        if (menuBib) {
            menuBib.onclick = function() {
                insertBibliographyFromDocument();
            };
        }

        var menuSettings = document.getElementById("menuItemCitationSettings");
        if (menuSettings) {
            menuSettings.onclick = function() {
                topMoreMenu.classList.add(displayNoneClass);
                openSettingsDrawer();
            };
        }

        var settingsDrawer = document.getElementById("settingsDrawer");
        var settingsDrawerBack = document.getElementById("settingsDrawerBackBtn");
        var changeStyleDrawer = document.getElementById("changeStyleDrawer");
        var changeStyleBack = document.getElementById("changeStyleBackBtn");
        var changeLangDrawer = document.getElementById("changeLangDrawer");
        var changeLangBack = document.getElementById("changeLangBackBtn");
        var btnOpenStyle = document.getElementById("btnOpenChangeStyle");
        var btnOpenLang = document.getElementById("btnOpenChangeLang");

        if (settingsDrawerBack) {
            settingsDrawerBack.onclick = function() {
                settingsDrawer.classList.add(displayNoneClass);
                elements.mainState.classList.remove(displayNoneClass);
            };
        }
        if (changeStyleBack) {
            changeStyleBack.onclick = function() {
                changeStyleDrawer.classList.add(displayNoneClass);
                settingsDrawer.classList.remove(displayNoneClass);
                updateSettingsOverview();
            };
        }
        if (changeLangBack) {
            changeLangBack.onclick = function() {
                changeLangDrawer.classList.add(displayNoneClass);
                settingsDrawer.classList.remove(displayNoneClass);
                updateSettingsOverview();
            };
        }
        if (btnOpenStyle) {
            btnOpenStyle.onclick = function() {
                settingsDrawer.classList.add(displayNoneClass);
                changeStyleDrawer.classList.remove(displayNoneClass);
                renderStyleCardsList();
            };
        }
        if (btnOpenLang) {
            btnOpenLang.onclick = function() {
                settingsDrawer.classList.add(displayNoneClass);
                changeLangDrawer.classList.remove(displayNoneClass);
                renderLangCardsList();
            };
        }

        function openSettingsDrawer() {
            elements.mainState.classList.add(displayNoneClass);
            settingsDrawer.classList.remove(displayNoneClass);
            updateSettingsOverview();
        }

        var styleDisplayNames = {
            "apa": "APA Style 7th edition",
            "american-medical-association": "American Medical Association 11th edition",
            "chicago-author-date": "Chicago Manual of Style 18th edition (author-date)",
            "chicago-notes-bibliography": "Chicago Manual of Style 18th edition (notes-bibliography)",
            "harvard-cite-them-right": "Cite Them Right 10th edition - Harvard",
            "ieee": "IEEE Reference Guide",
            "modern-language-association": "Modern Language Association 9th edition",
            "nature": "Nature",
            "american-political-science-association": "American Political Science Association",
            "american-sociological-association": "American Sociological Association 6th edition"
        };

        function updateSettingsOverview() {
            var curStyleLabel = document.getElementById("settingsCurrentStyleName");
            var curLangLabel = document.getElementById("settingsCurrentLangName");
            var previewBox = document.getElementById("settingsStylePreviewBox");

            var sName = styleDisplayNames[selectedStyle] || selectedStyle || "APA Style 7th edition";
            if (curStyleLabel) curStyleLabel.textContent = sName;
            if (curLangLabel) curLangLabel.textContent = selectedLocale || "English (US)";

            if (previewBox) {
                try {
                    var mockDoc = {
                        "mock-1": {
                            id: "mock-1",
                            type: "article-journal",
                            title: "Placeholder Text: A Study",
                            author: [
                                { family: "Smith", given: "J." },
                                { family: "Petrovic", given: "P." },
                                { family: "Rose", given: "M." },
                                { family: "De Souz", given: "C." }
                            ],
                            issued: { "date-parts": [[2021]] },
                            "container-title": "The Journal of Citation Styles",
                            volume: "3",
                            DOI: "10.10/X"
                        }
                    };
                    var engine = new CSL.Engine({
                        retrieveLocale: function(l) { return locales[l]; },
                        retrieveItem: function(id) { return mockDoc[id]; }
                    }, styles[selectedStyle], selectedLocale, true);
                    engine.updateItems(["mock-1"]);
                    var citPreview = engine.makeCitationCluster([{ id: "mock-1" }]);
                    var bibPreview = engine.makeBibliography();
                    var bibText = (bibPreview && bibPreview[1]) ? bibPreview[1].join('') : "";
                    previewBox.innerHTML = "<div style=\"font-weight:600; margin-bottom:4px;\">" + citPreview + "</div><div style=\"font-size:11px; color:#555;\">" + bibText.replace(/<[^>]+>/g, '') + "</div>";
                } catch(e) {
                    previewBox.textContent = "(Smith et al., 2021)";
                }
            }
        }

        function renderStyleCardsList() {
            var holder = document.getElementById("styleListItemsContainer");
            if (!holder) return;
            holder.innerHTML = "";

            // Default popular styles
            var popularStyles = [
                { id: "apa", title: "APA Style 7th edition", cit: "(Smith et al., 2021)", bib: "Smith, J., Petrovic, P., Rose, M., De Souz, C. (2021). Placeholder Text: A Study. The Journal of Citation Styles, 3." },
                { id: "chicago-author-date", title: "Chicago Manual of Style 18th edition (author-date)", cit: "(Smith et al. 2021)", bib: "Smith, J., P. Petrovic, M. Rose, and C. De Souz. 2021. \"Placeholder Text: A Study.\" The Journal of Citation Styles 3." },
                { id: "ieee", title: "IEEE Reference Guide", cit: "[1]", bib: "[1] J. Smith, P. Petrovic, M. Rose, and C. De Souz, \"Placeholder Text: A Study,\" The Journal of Citation Styles, vol. 3, 2021." },
                { id: "nature", title: "Nature", cit: "1", bib: "1. Smith, J., Petrovic, P., Rose, M. & De Souz, C. Placeholder Text: A Study. The Journal of Citation Styles 3 (2021)." },
                { id: "american-medical-association", title: "American Medical Association 11th edition", cit: "1", bib: "1. Smith J, Petrovic P, Rose M, De Souz C. Placeholder Text: A Study. The Journal of Citation Styles. 2021;3." },
                { id: "harvard-cite-them-right", title: "Cite Them Right 10th edition - Harvard", cit: "(Smith et al., 2021)", bib: "Smith, J. et al. (2021) 'Placeholder Text: A Study', The Journal of Citation Styles, 3." },
                { id: "modern-language-association", title: "Modern Language Association 9th edition", cit: "(Smith et al.)", bib: "Smith, J., et al. \"Placeholder Text: A Study.\" The Journal of Citation Styles, vol. 3, 2021." },
                { id: "vancouver", title: "Vancouver", cit: "(1)", bib: "1. Smith J, Petrovic P. Placeholder Text. J Cit Styles. 2021;3." },
                { id: "springer-basic-author-date", title: "Springer - Basic (author-date)", cit: "(Smith et al. 2021)", bib: "Smith J, Petrovic P (2021) Placeholder Text. J Cit Styles 3." },
                { id: "elsevier-harvard", title: "Elsevier - Harvard (with titles)", cit: "(Smith et al., 2021)", bib: "Smith, J., Petrovic, P., 2021. Placeholder Text. J Cit Styles 3." }
            ];

            var fullList = (window._allStylesList && window._allStylesList.length) ? window._allStylesList : [];
            var independentStyles = fullList.filter(function(s) { return s.dep === 0 || s.dependent === 0; });
            var activeDataset = independentStyles.length ? independentStyles : popularStyles;

            var currentLimit = 50;
            var currentFilterQuery = "";

            function createCard(s) {
                var card = document.createElement("div");
                card.style.cssText = "padding:12px 16px; border-bottom:1px solid #e0e0e0; cursor:pointer;";
                var styleId = s.name || s.id;
                var isSelected = (selectedStyle === styleId);
                if (isSelected) {
                    card.style.backgroundColor = "#e8f0fe";
                }
                var sTitle = s.title || s.name;
                var sCit = s.cit || "";
                var sBib = s.bib || "";

                card.innerHTML = "<div style=\"font-weight:700; color:" + (isSelected ? "#103864" : "#222") + "; font-size:13px; margin-bottom:4px;\">" + sTitle + "</div>" +
                                 (sCit ? "<div style=\"font-size:12px; color:#444; margin-bottom:4px;\">" + sCit + "</div>" : "") +
                                 (sBib ? "<div style=\"font-size:11px; color:#666; line-height:1.35;\">" + sBib + "</div>" : "");

                card.onclick = function() {
                    selectedStyle = styleId;
                    styleDisplayNames[styleId] = sTitle;
                    saveLastUsedStyle(styleId);
                    showLoader(true);
                    getStyle(styleId).then(function() {
                        showLoader(false);
                        refreshDocumentCitations();
                        changeStyleDrawer.classList.add(displayNoneClass);
                        settingsDrawer.classList.remove(displayNoneClass);
                        updateSettingsOverview();
                    }).catch(function(err) {
                        showLoader(false);
                        showError("Failed to load citation style: " + err.message);
                    });
                };
                return card;
            }

            function renderCurrentView() {
                holder.innerHTML = "";
                var dataset = activeDataset;
                if (currentFilterQuery) {
                    dataset = fullList.filter(function(st) {
                        return (st.title && st.title.toLowerCase().indexOf(currentFilterQuery) !== -1) ||
                               (st.name && st.name.toLowerCase().indexOf(currentFilterQuery) !== -1);
                    });
                }

                var itemsToShow = dataset.slice(0, currentLimit);
                itemsToShow.forEach(function(s) {
                    holder.appendChild(createCard(s));
                });

                if (dataset.length > currentLimit) {
                    var moreBtn = document.createElement("div");
                    moreBtn.style.cssText = "padding:12px; text-align:center; color:#005a9e; font-weight:600; cursor:pointer; background:#f7f9fa; border-top:1px solid #e0e0e0;";
                    moreBtn.textContent = "Load more styles (" + (dataset.length - currentLimit) + " remaining)...";
                    moreBtn.onclick = function() {
                        currentLimit += 50;
                        renderCurrentView();
                    };
                    holder.appendChild(moreBtn);
                }
            }

            renderCurrentView();

            var searchInp = document.getElementById("styleSearchInput");
            if (searchInp) {
                searchInp.value = "";
                searchInp.oninput = function() {
                    currentFilterQuery = searchInp.value.trim().toLowerCase();
                    currentLimit = 50;
                    renderCurrentView();
                };
            }
        }

        function renderLangCardsList() {
            var holder = document.getElementById("langListItemsContainer");
            if (!holder) return;
            holder.innerHTML = "";
            var langs = [
                { code: "en-US", name: "English (US)" },
                { code: "en-GB", name: "English (UK)" },
                { code: "id-ID", name: "Indonesian" },
                { code: "es-ES", name: "Spanish" },
                { code: "fr-FR", name: "French" },
                { code: "de-DE", name: "German" },
                { code: "ja-JP", name: "Japanese" },
                { code: "zh-CN", name: "Chinese (PRC)" }
            ];
            langs.forEach(function(l) {
                var row = document.createElement("div");
                row.style.cssText = "padding:12px 16px; border-bottom:1px solid #eee; cursor:pointer; font-size:13px; color:#222;";
                if (selectedLocale === l.code) {
                    row.style.backgroundColor = "#e8f0fe";
                    row.style.fontWeight = "bold";
                    row.style.color = "#1a73e8";
                }
                row.textContent = l.name;
                row.onclick = function() {
                    selectedLocale = l.code;
                    getLocale(l.code).then(function() {
                        refreshDocumentCitations();
                    }).catch(function() {});
                    changeLangDrawer.classList.add(displayNoneClass);
                    settingsDrawer.classList.remove(displayNoneClass);
                    updateSettingsOverview();
                };
                holder.appendChild(row);
            });
        }

        var menuUnlink = document.getElementById("menuItemUnlinkCitations");
        if (menuUnlink) {
            menuUnlink.onclick = function() {
                unlinkAllCitations();
            };
        }

        var menuLogout = document.getElementById("menuItemLogout");
        if (menuLogout) {
            menuLogout.onclick = function() {
                localStorage.removeItem("mendToken");
                window._activeMendToken = null;
                switchAuthState("login");
            };
        }

        var DRAWER_ICONS = {
            all: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
            recently_added: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
            favorites: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
            folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
            group: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
        };

        function renderCollectionDrawer() {
            var holder = elements.drawerListHolder;
            if (!holder) return;
            holder.innerHTML = "";

            function createItem(icon, label, filterObj) {
                var row = document.createElement("div");
                row.style.cssText = "display:flex; align-items:center; gap:12px; padding:11px 16px; cursor:pointer; font-size:13px; color:var(--text-main); border-bottom:1px solid var(--border-subtle);";
                if (currentFilter.type === filterObj.type && currentFilter.id === filterObj.id) {
                    row.style.backgroundColor = "var(--brand-selection)";
                    row.style.fontWeight = "600";
                    row.style.color = "var(--brand-accent)";
                }
                row.innerHTML = "<span class=\"ui-icon\" style=\"width:20px; text-align:center; color:currentColor;\">" + icon + "</span><span>" + label + "</span>";
                row.onclick = function() {
                    applyFilter(filterObj);
                };
                return row;
            }

            function createHeader(title) {
                var hdr = document.createElement("div");
                hdr.className = "form-section-title";
                hdr.style.padding = "14px 16px 6px 16px";
                hdr.textContent = title;
                return hdr;
            }

            // 1. Default standard filters
            holder.appendChild(createItem(DRAWER_ICONS.all, "All References", { type: "all", id: null, label: "All References" }));
            holder.appendChild(createItem(DRAWER_ICONS.recently_added, "Recently Added", { type: "recently_added", id: null, label: "Recently Added" }));
            holder.appendChild(createItem(DRAWER_ICONS.favorites, "Favorites", { type: "favorites", id: null, label: "Favorites" }));

            // 2. Collections (Folders)
            holder.appendChild(createHeader("Collections"));
            var token = authFlow.getToken();
            if (token) {
                fetch("https://api.mendeley.com/folders", {
                    headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.mendeley-folder.1+json" }
                }).then(function(r) { return r.json(); }).then(function(folders) {
                    if (folders && folders.length) {
                        folders.forEach(function(f) {
                            holder.appendChild(createItem(DRAWER_ICONS.folder, f.name, { type: "folder", id: f.id, label: f.name }));
                        });
                    } else {
                        var emptyF = document.createElement("div");
                        emptyF.style.cssText = "padding:6px 16px; color:#999; font-size:12px; font-style:italic;";
                        emptyF.textContent = "No collections created yet";
                        holder.appendChild(emptyF);
                    }
                }).catch(function() {});
            }

            // 3. Groups
            holder.appendChild(createHeader("Groups"));
            if (token) {
                fetch("https://api.mendeley.com/groups", {
                    headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.mendeley-group.1+json" }
                }).then(function(r) { return r.json(); }).then(function(groups) {
                    if (groups && groups.length) {
                        groups.forEach(function(g) {
                            holder.appendChild(createItem(DRAWER_ICONS.group, g.name, { type: "group", id: g.id, label: g.name }));
                        });
                    } else {
                        var emptyG = document.createElement("div");
                        emptyG.style.cssText = "padding:6px 16px; color:#999; font-size:12px; font-style:italic;";
                        emptyG.textContent = "No groups created yet";
                        holder.appendChild(emptyG);
                    }
                }).catch(function() {});
            }
        }

        var existingToken = authFlow.getToken();
        if (existingToken) {
            switchAuthState("main");
            loadFilteredLibrary(false);
        } else {
            fetch("http://127.0.0.1:8080/token")
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data && data.token) {
                        window._activeMendToken = data.token;
                        localStorage.setItem("mendToken", data.token);
                        switchAuthState("main");
                        loadFilteredLibrary(false);
                    } else {
                        switchAuthState((window.Asc.plugin.mendeley || getSettings()) ? "login" : "config");
                    }
                })
                .catch(function() {
                    switchAuthState((window.Asc.plugin.mendeley || getSettings()) ? "login" : "config");
                });
        }

        if (window.Asc.plugin.mendeley) {
            switchClass(elements.reconfigBtn, displayNoneClass, true);
        }
    };

    OAuthError = function (error) {
        showError(error);
    };

    OAuthCallback = function (token, state) {
        if (state && loginStateHash && state != loginStateHash && !window.Asc.plugin.mendeley) {
            OAuthError("State validation failed. Possible CSRF attack.");
            return;
        }
        localStorage.setItem("mendToken", token);
        window._activeMendToken = token;
        showLoader(false);
        switchAuthState("main");
        loadFilteredLibrary(false);
    };

    var scrollBoxes = [];
    function initScrollBox(holder, thumb, onscroll) {
        if (!holder) return { onscroll: function () {} };
        var scroller = {};
        scroller.onscroll = checkScroll(holder, thumb, onscroll);

        holder.addEventListener("scroll", function () {
            scroller.onscroll();
        }, { passive: true });

        if (thumb) {
            thumb.onmousedown = function (e) {
                switchClass(thumb, "scrolling", true);
                var y = e.clientY;
                var initialPos = holder.scrollTop;

                window.onmouseup = function (e) {
                    switchClass(thumb, "scrolling", false);
                    window.onmouseup = null;
                    window.onmousemove = null;
                };
                window.onmousemove = function (e) {
                    var delta = e.clientY - y;

                    var percMoved = delta / holder.clientHeight;
                    var deltaScroll = holder.scrollHeight * percMoved;
                    holder.scrollTop = initialPos + deltaScroll;

                    scroller.onscroll();
                };
            };
        }

        scrollBoxes.push(scroller);

        document.body.onresize = function () {
            for (var i = 0; i < scrollBoxes.length; i++) {
                scrollBoxes[i].onscroll();
            }
        };

        return scroller;
    }

    var selectLists = [];
    function initSelectBoxes() {
        var select = document.getElementsByClassName("control select");
        for (var i = 0; i < select.length; i++) {
            var input = select[i];
            var holder = input.parentElement;
            var arrow = document.createElement("span");
            arrow.classList.add("selectArrow");
            arrow.appendChild(document.createElement("span"));
            arrow.appendChild(document.createElement("span"));
            holder.appendChild(arrow);

            for (var k = 0; k < holder.getElementsByClassName("selectList").length; k++) {
                var list = holder.getElementsByClassName("selectList")[k];
                if (list.children.length > 0) {
                    var def = false;
                    for (var j = 0; j < list.children.length; j++) {
                        if (list.children[j].hasAttribute("selected")) {
                            selectInput(input, list.children[j], list);
                            def = true;
                        }

                        list.children[j].onclick = onClickListElement(list, input);
                    }
                    if (!def) {
                        selectInput(input, list.children[0], list);
                    }
                }

                var f = function (list, input) {
                    return function (ev) {
                        ev.stopPropagation();
                        if (!elements.styleSelectListOther.classList.contains(displayNoneClass))
                        return true;

                        if (list.onopen) {
                            list.onopen();
                        }
                        if (!input.hasAttribute("readonly")) {
                            input.select();
                        }
                        openList(list);
                        return true;
                    };
                };

                if (k !== 1) {
                    input.onclick = f(list, input);
                    arrow.onclick = f(list, input);
                }
                selectLists.push(list);
            }
        }

        window.onclick = function () {
            openList(null);
        }
    }

    function openList(el) {
        for (var i = 0; i < selectLists.length; i++) {
            var close = true;
            if (selectLists[i] === el) {
                close = false;
            }
            switchClass(selectLists[i], displayNoneClass, close);
        }
    }

    function selectInput(input, el, list) {
        input.value = el.textContent;
        var val = el.getAttribute("data-value");
        input.setAttribute("data-value", val);
        input.setAttribute("title", el.textContent);
        if (input.onselectchange) {
            input.onselectchange(input, val);
        }
        switchClass(list, displayNoneClass, true);
    };

    function onClickListElement(list, input) {
        return function (ev) {
            var sel = ev.target.getAttribute("data-value");
            for (var i = 0; i < list.children.length; i++) {
                if (list.children[i].getAttribute("data-value") == sel) {
                    list.children[i].setAttribute("selected", "");
                    selectInput(input, list.children[i], list);
                } else {
                    if (list.children[i].hasAttribute("selected")) {
                        list.children[i].attributes.removeNamedItem("selected");
                    }
                }
            }
        };
    };

    function applyTranslations() {
        var elements = document.getElementsByClassName("i18n");

        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            if (el.attributes["placeholder"]) el.attributes["placeholder"].value = getMessage(el.attributes["placeholder"].value);
            if (el.innerText) el.innerText = getMessage(el.innerText);
        }
    }

    function saveLastUsedStyle(id) {
        localStorage.setItem("mendStyleId", id);
    }

    function getLastUsedStyle() {
        return localStorage.getItem("mendStyleId");
    }

    function saveSettings(id) {
        mendAppId = id;
        localStorage.setItem("mendAppId", id);
    }

    function getSettings() {
        mendAppId = localStorage.getItem("mendAppId");
        return mendAppId;
    }

    function clearSettings() {
        mendAppId = null;
        localStorage.removeItem("mendAppId");
    }

    function getMessage(key) {
        return window.Asc.plugin.tr(key);
    }

    var loadingLocale = false;
    function getLocale(langTag) {
        return new Promise(function (res, rej) {
            if (locales[langTag] != null) {
                res(locales[langTag]);
            } else {
                loadingLocale = true;
                fetch("https://cdn.jsdelivr.net/gh/citation-style-language/locales@master/locales-" + langTag + ".xml")
                    .then(function (resp) { return resp.text(); })
                    .then(function (text) { locales[langTag] = text; res(text); loadingLocale = false; })
                    .catch(function (err) { rej(err); loadingLocale = false; });
            }
        });
    }

    var loadingStyle = false;
    function getStyle(styleName) {
        return new Promise(function (res, rej) {
            if (styles[styleName] != null) {
                res(styles[styleName]);
            } else {
                loadingStyle = true;
                // Try official zotero styles first, then fallback to CSL official repo
                fetch("https://www.zotero.org/styles/" + styleName)
                    .then(function (resp) {
                        if (!resp.ok) throw new Error("Zotero style fetch status " + resp.status);
                        return resp.text();
                    })
                    .then(function (text) {
                        if (text && text.indexOf("<style") !== -1) {
                            styles[styleName] = text;
                            loadingStyle = false;
                            res(text);
                        } else {
                            throw new Error("Invalid style response");
                        }
                    })
                    .catch(function (err) {
                        fetch("https://raw.githubusercontent.com/citation-style-language/styles/master/" + styleName + ".csl")
                            .then(function(r) {
                                if (!r.ok) throw new Error("CSL GitHub style fetch status " + r.status);
                                return r.text();
                            })
                            .then(function(text) {
                                styles[styleName] = text;
                                loadingStyle = false;
                                res(text);
                            })
                            .catch(function(e) {
                                loadingStyle = false;
                                rej(e);
                            });
                    });
            }
        });
    }

    function showLoader(show) {
        switchClass(elements.loader, displayNoneClass, !show);
        switchClass(elements.contentHolder, blurClass, show);
    }

    function showError(message) {
        if (message) {
            switchClass(elements.error, displayNoneClass, false);
            elements.error.textContent = message;
            setTimeout(function () { window.onclick = function () { showError(); }; }, 100);
        } else {
            switchClass(elements.error, displayNoneClass, true);
            elements.error.textContent = "";
            window.onclick = null;
        }
    }

    function showLibLoader(show) {
        switchClass(elements.libLoader, displayNoneClass, !show);
    }

    function switchClass(el, className, add) {
        if (add) {
            el.classList.add(className);
        } else {
            el.classList.remove(className);
        }
    }

    function configState(hide) {
        if (elements.configState) switchClass(elements.configState, displayNoneClass, hide);
    }

    function loginState(hide) {
        if (elements.loginState) switchClass(elements.loginState, displayNoneClass, hide);
    }

    function mainState(hide) {
        if (elements.mainState) switchClass(elements.mainState, displayNoneClass, hide);
        if (elements.logoutLink) switchClass(elements.logoutLink, displayNoneClass, hide);
    }

    var currentAuthState;
    function switchAuthState(state) {
        currentAuthState = state;
        configState(true);
        loginState(true);
        mainState(true);
        switch (state) {
            case 'config':
                configState(false);
                break;
            case 'login':
                loginState(false);
                break;
            case 'main':
                mainState(false);
                break;
        }
    }

    function checkScroll(holder, thumb, func) {
        return function () {
            if (thumb) {
                if (holder.scrollHeight <= holder.clientHeight) {
                    switchClass(thumb, displayNoneClass, true);
                } else {
                    switchClass(thumb, displayNoneClass, false);
                    var height = holder.clientHeight / holder.scrollHeight * holder.clientHeight;
                    height = height < 40 ? 40 : height;
                    thumb.style.height = height + "px";

                    var scroll = holder.scrollHeight - holder.clientHeight;
                    var percScrolled = holder.scrollTop / scroll;

                    var margin = percScrolled * (holder.clientHeight - height);
                    thumb.style.marginTop = margin + "px";
                }
            }

            if (func) func(holder, thumb);
        };
    }

    var loadTimeout = null;
    function checkDocsScroll(holder) {
        var scrollEl = holder || elements.docsWrapper || elements.docsHolder;
        if (!scrollEl) return;

        if (shouldLoadMore(scrollEl)) {
            if (waitForLoad) return;
            waitForLoad = true;
            clearTimeout(loadTimeout);

            loadTimeout = setTimeout(function () {
                if (currentAuthState !== "main") {
                    waitForLoad = false;
                    return;
                }

                if (lastSearch.ownObj && typeof lastSearch.ownObj.next === "function") {
                    loadLibrary(lastSearch.ownObj.next(), true, true);
                } else if (lastSearch.catObj && typeof lastSearch.catObj.next === "function") {
                    loadLibrary(lastSearch.catObj.next(), true, false);
                } else {
                    waitForLoad = false;
                }
            }, 60);
        }
    }

    function shouldLoadMore(holder) {
        if (currentAuthState !== "main") return false;
        if (waitForLoad) return false;

        var hasNext = (lastSearch.ownObj && typeof lastSearch.ownObj.next === "function") ||
                      (lastSearch.catObj && typeof lastSearch.catObj.next === "function");
        if (!hasNext) return false;

        var threshold = 250;
        var currentScroll = holder.scrollTop + holder.clientHeight;
        var maxScroll = holder.scrollHeight;

        return currentScroll >= (maxScroll - threshold);
    }

    function clearLibrary() {
        var holder = elements.docsHolder;
        while (holder.lastChild) {
            holder.removeChild(holder.lastChild);
        }
        if (elements.docsWrapper) {
            elements.docsWrapper.scrollTop = 0;
        } else {
            holder.scrollTop = 0;
        }
        lastSearch.catObj = null;
        lastSearch.ownObj = null;
        waitForLoad = false;
        if (loadTimeout) {
            clearTimeout(loadTimeout);
            loadTimeout = null;
        }
        if (docsScroller && docsScroller.onscroll) docsScroller.onscroll();
    }

    function loadLibrary(promise, append, own) {
        showLibLoader(true);
        promise
            .then(function (res) {
                displaySearchItems(append, own, res, null);
            })
            .catch(function (err) {
                var status = err && err.response ? err.response.status : null;
                var errMsg = String((err && (err.message || err.statusText || err)) || "");
                if (status === 401 || errMsg.indexOf("401") !== -1 || errMsg.indexOf("Unauthorized") !== -1) {
                    console.warn("Token unauthorized or expired (401), resetting session");
                    localStorage.removeItem("mendToken");
                    window._activeMendToken = null;
                    clearLibrary();
                    switchAuthState("login");
                    showError("Session expired or invalid token. Please login again.");
                } else {
                    displaySearchItems(append, own, null, errMsg);
                }
            })
            .finally(function () {
                showLibLoader(false);
                waitForLoad = false;
                setTimeout(function () {
                    checkDocsScroll(elements.docsWrapper);
                }, 150);
            });
    }
    function displaySearchItems(append, own, res, err) {
        var holder = elements.docsHolder;

        if (!append) {
            clearLibrary();
        }

        var first = false;
        if (own) {
            if (!lastSearch.ownObj) first = true;
            if (err) {
                if (first) lastSearch.ownObj = {};
                lastSearch.ownObj.next = null;
            } else {
                lastSearch.ownObj = res;
            }
        } else {
            if (!lastSearch.catObj) first = true;
            if (err) {
                if (first) lastSearch.catObj = {};
                lastSearch.catObj.next = null;
            } else {
                lastSearch.catObj = res;
            }
        }

        if (!own && first) {
            var divider = document.createElement("div");
            divider.textContent = getMessage("Search in all literature:");
            divider.classList.add("searchDivider");
            divider.classList.add("defaultlable");
            holder.appendChild(divider);
        }

        var page = document.createElement("div");
        page.classList.add("page" + holder.children.length);
        if (res && res.items.length > 0) {
            for (var i = 0; i < res.items.length; i++) {
                page.appendChild(buildDocElement(res.items[i]));
            }
        } else if (err || first) {
            if (err) {
                showError(err);
            } else {
                var notFound = document.createElement("div");
                notFound.textContent = own ? getMessage("Nothing found in your library") : getMessage("Nothing found");
                notFound.classList.add("searchInfo");
                notFound.classList.add("defaultlable");
                page.appendChild(notFound);
            }
        }
        holder.appendChild(page);

        docsScroller.onscroll();
    }

    function buildDocElement(item) {
        var root = document.createElement("div");
        root.className = "doc-card";

        var check = document.createElement("input");
        check.setAttribute("type", "checkbox");
        check.className = "doc-checkbox";
        if (selected.items[item.id]) {
            check.checked = true;
            selected.checks[item.id] = check;
            root.classList.add("selected");
        }

        var docInfo = document.createElement("div");
        docInfo.className = "doc-content";

        var title = document.createElement("div");
        title.textContent = item.title;
        title.className = "doc-title";
        docInfo.appendChild(title);

        if (item.authors && item.authors.length > 0) {
            var authors = document.createElement("div");
            authors.textContent = item.authors
                .map(function (a) { return (a.last_name || a.family || "") + ", " + (a.first_name || a.given || ""); })
                .join("; ");
            authors.setAttribute("title", authors.textContent);
            authors.className = "doc-authors";
            docInfo.appendChild(authors);
        }

        var source = document.createElement("div");
        if (item.source || item.publisher) {
            source.textContent = item.source || item.publisher;
        }
        if (item.year) {
            if (source.textContent) {
                source.textContent += " (" + item.year + ")";
            } else {
                source.textContent = item.year;
            }
        }
        source.setAttribute("title", source.textContent);
        source.className = "doc-source";
        docInfo.appendChild(source);

        root.appendChild(check);
        root.appendChild(docInfo);

        function selectItem(input, item) {
            return function (e) {
                input.checked = !input.checked;
                if (input.checked) {
                    root.classList.add("selected");
                    addSelected(item, input);
                } else {
                    root.classList.remove("selected");
                    removeSelected(item.id);
                }
            };
        }

        var f = selectItem(check, item);
        check.onclick = function(e) {
            e.stopPropagation();
            if (check.checked) {
                root.classList.add("selected");
                addSelected(item, check);
            } else {
                root.classList.remove("selected");
                removeSelected(item.id);
            }
        };
        docInfo.onclick = f;

        return root;
    }

    function addSelected(item, input) {
        var el = buildSelectedElement(item);
        selected.items[item.id] = item;
        selected.html[item.id] = el;
        selected.checks[item.id] = input;
        elements.selectedHolder.appendChild(el);
        docsScroller.onscroll();
        selectedScroller.onscroll();
        checkSelected();
    }

    function removeSelected(id) {
        var el = selected.html[id];
        delete selected.items[id];
        delete selected.html[id];
        if (selected.checks[id]) {
            selected.checks[id].checked = false;
            delete selected.checks[id];
        }
        elements.selectedHolder.removeChild(el);
        docsScroller.onscroll();
        selectedScroller.onscroll();
        checkSelected();
    }

    function getCitationPillLabel(item) {
        var year = item.year || "";
        if (item.authors && item.authors.length > 0) {
            var primary = item.authors[0].last_name || item.authors[0].family || "";
            if (item.authors.length === 1) {
                return primary + (year ? " " + year : "");
            } else if (item.authors.length === 2) {
                var second = item.authors[1].last_name || item.authors[1].family || "";
                return primary + " & " + second + (year ? " " + year : "");
            } else {
                return primary + " et al." + (year ? " " + year : "");
            }
        }
        // Fallback to title
        var t = item.title || "Reference";
        if (t.length > 25) t = t.slice(0, 22) + "...";
        return t + (year ? " " + year : "");
    }

    function buildSelectedElement(item) {
        var root = document.createElement("div");
        root.className = "citation-pill";

        var label = document.createElement("span");
        label.className = "citation-pill-label";
        label.textContent = getCitationPillLabel(item);
        label.setAttribute("title", "Click to edit citation parameters");
        label.onclick = function (e) {
            e.stopPropagation();
            openEditCitationDrawer(item);
        };

        var remove = document.createElement("span");
        remove.className = "citation-pill-remove";
        remove.innerHTML = "&#xd7;";
        remove.onclick = function (e) {
            e.stopPropagation();
            removeSelected(item.id);
        };

        root.appendChild(label);
        root.appendChild(remove);

        return root;
    }

    var currentlyEditingItem = null;
    function openEditCitationDrawer(item) {
        currentlyEditingItem = item;
        item.citationParams = item.citationParams || {
            displayAs: "default",
            locatorType: "page",
            locatorValue: "",
            prefix: "",
            suffix: ""
        };

        var drawer = document.getElementById("editCitationDrawer");
        var main = elements.mainState;
        var docName = document.getElementById("editCitationDocName");
        var displayAs = document.getElementById("editDisplayAsSelect");
        var locType = document.getElementById("editLocatorTypeSelect");
        var locVal = document.getElementById("editLocatorValueInput");
        var prefix = document.getElementById("editPrefixInput");
        var suffix = document.getElementById("editSuffixInput");

        var overrideDrawer = document.getElementById("overrideManuallyDrawer");
        var btnOpenOverride = document.getElementById("btnOpenOverrideManually");
        var overrideTextarea = document.getElementById("manualOverrideTextarea");
        var btnRevertOverride = document.getElementById("btnRevertDefaultOverride");
        var saveOverrideBtn = document.getElementById("saveManualOverrideBtn");
        var cancelOverrideBtn = document.getElementById("cancelManualOverrideBtn");
        var overrideBackBtn = document.getElementById("overrideManuallyBackBtn");

        if (docName) docName.textContent = getCitationPillLabel(item);
        if (displayAs) displayAs.value = item.citationParams.displayAs || "default";
        if (locType) locType.value = item.citationParams.locatorType || "page";
        if (locVal) locVal.value = item.citationParams.locatorValue || "";
        if (prefix) prefix.value = item.citationParams.prefix || "";
        if (suffix) suffix.value = item.citationParams.suffix || "";

        function calculateDefaultCitationText() {
            var pfx = (prefix ? prefix.value : "").trim();
            var sfx = (suffix ? suffix.value : "").trim();
            var lv = (locVal ? locVal.value : "").trim();
            var lt = locType ? locType.value : "page";
            var mode = displayAs ? displayAs.value : "default";
            var yr = item.year || "2025";
            var authors = item.authors && item.authors[0] ? (item.authors[0].last_name || item.authors[0].family || "Author") : "Author";
            if (item.authors && item.authors.length > 2) authors += " et al.";
            else if (item.authors && item.authors.length === 2) authors += " & " + (item.authors[1].last_name || item.authors[1].family || "");

            var locStr = lv ? (", " + (lt === "page" ? "p. " : lt + " ") + lv) : "";
            if (mode === "narrative") {
                return authors + " (" + (pfx ? pfx + " " : "") + yr + locStr + (sfx ? " " + sfx : "") + ")";
            } else if (mode === "author_only") {
                return authors;
            } else if (mode === "year_only") {
                return "(" + (pfx ? pfx + " " : "") + yr + locStr + (sfx ? " " + sfx : "") + ")";
            } else {
                return "(" + (pfx ? pfx + " " : "") + authors + ", " + yr + locStr + (sfx ? " " + sfx : "") + ")";
            }
        }

        function updatePreview() {
            var prevBox = document.getElementById("editCitationPreviewText");
            if (!prevBox) return;
            if (item.citationParams && item.citationParams.manualOverride) {
                prevBox.textContent = item.citationParams.manualOverride;
            } else {
                prevBox.textContent = calculateDefaultCitationText();
            }
        }

        if (displayAs) displayAs.onchange = updatePreview;
        if (locType) locType.onchange = updatePreview;
        if (locVal) locVal.oninput = updatePreview;
        if (prefix) prefix.oninput = updatePreview;
        if (suffix) suffix.oninput = updatePreview;

        updatePreview();

        // Setup Manual Override interactions
        if (btnOpenOverride) {
            btnOpenOverride.onclick = function() {
                drawer.classList.add(displayNoneClass);
                overrideDrawer.classList.remove(displayNoneClass);
                if (overrideTextarea) {
                    overrideTextarea.value = (item.citationParams && item.citationParams.manualOverride) ?
                                             item.citationParams.manualOverride : calculateDefaultCitationText();
                }
            };
        }

        if (btnRevertOverride) {
            btnRevertOverride.onclick = function() {
                if (overrideTextarea) {
                    overrideTextarea.value = calculateDefaultCitationText();
                }
            };
        }

        if (saveOverrideBtn) {
            saveOverrideBtn.onclick = function() {
                if (currentlyEditingItem) {
                    currentlyEditingItem.citationParams.manualOverride = overrideTextarea ? overrideTextarea.value : "";
                }
                overrideDrawer.classList.add(displayNoneClass);
                drawer.classList.remove(displayNoneClass);
                updatePreview();
            };
        }

        function closeOverrideDrawer() {
            overrideDrawer.classList.add(displayNoneClass);
            drawer.classList.remove(displayNoneClass);
        }
        if (cancelOverrideBtn) cancelOverrideBtn.onclick = closeOverrideDrawer;
        if (overrideBackBtn) overrideBackBtn.onclick = closeOverrideDrawer;

        var saveBtn = document.getElementById("saveCitationChangesBtn");
        var cancelBtn = document.getElementById("cancelCitationChangesBtn");
        var backBtn = document.getElementById("editCitationBackBtn");

        function closeDrawer() {
            if (drawer) drawer.classList.add(displayNoneClass);
            if (main) main.classList.remove(displayNoneClass);
        }

        if (saveBtn) {
            saveBtn.onclick = function() {
                if (currentlyEditingItem) {
                    currentlyEditingItem.citationParams.displayAs = displayAs ? displayAs.value : "default";
                    currentlyEditingItem.citationParams.locatorType = locType ? locType.value : "page";
                    currentlyEditingItem.citationParams.locatorValue = locVal ? locVal.value : "";
                    currentlyEditingItem.citationParams.prefix = prefix ? prefix.value : "";
                    currentlyEditingItem.citationParams.suffix = suffix ? suffix.value : "";
                }
                closeDrawer();
            };
        }
        if (cancelBtn) cancelBtn.onclick = closeDrawer;
        if (backBtn) backBtn.onclick = closeDrawer;

        if (main) main.classList.add(displayNoneClass);
        if (drawer) drawer.classList.remove(displayNoneClass);
    }

    function checkSelected() {
        var count = selected.count();
        var hasSelected = count > 0;
        var manySelected = count >= 3;
        // Pills wrapper visibility
        switchClass(elements.selectedWrapper, displayNoneClass, !hasSelected);
        // Split-view layout when >=3 items
        switchClass(elements.mainState, "has-many-selected", manySelected);
        if (elements.insertLinkBtn) {
            elements.insertLinkBtn.style.opacity = hasSelected ? "1" : "0.6";
            elements.insertLinkBtn.style.pointerEvents = hasSelected ? "auto" : "none";
        }
        if (elements.cancelBtn) {
            elements.cancelBtn.style.opacity = hasSelected ? "1" : "0.6";
            elements.cancelBtn.style.pointerEvents = hasSelected ? "auto" : "none";
        }
    }

    var repeatTimeout;
    function formatInsertBibliography() {
        if (!selectedStyle) {
            showError(getMessage("Style is not selected"));
            return;
        }
        if (!selectedLocale) {
            showError(getMessage("Language is not selected"));
            return;
        }

        clearTimeout(repeatTimeout);
        if (loadingStyle || loadingLocale) {
            repeatTimeout = setTimeout(formatInsertBibliography, 100);
            return;
        }

        var data = {};
        var keys = [];
        for (var item in selected.items) {
            data[item] = convertMendeleyToCSL(selected.items[item]);
            keys.push(item);
        }

        try {
            var formatter = new CSL.Engine({ retrieveLocale: function (id) { return locales[id]; }, retrieveItem: function (id) { return data[id]; } }, styles[selectedStyle], selectedLocale, true);
            formatter.updateItems(keys);

            insertInDocument(formatter.makeBibliography()[1]);
        } catch (e) {
            showError(e);
        }
    }
    function formatInsertLink() {
        if (!selectedStyle) selectedStyle = "apa";
        if (!selectedLocale) selectedLocale = "en-US";

        showLoader(true);
        Promise.all([getStyle(selectedStyle), getLocale(selectedLocale)]).then(function() {
            showLoader(false);
            executeInsertLink();
        }).catch(function(err) {
            showLoader(false);
            showError("Failed to prepare citation engine: " + (err.message || err));
        });
    }

    function executeInsertLink() {
        var data = {};
        var keys = [];
        var keysL = [];
        for (var item in selected.items) {
            var selItem = selected.items[item];
            data[item] = convertMendeleyToCSL(selItem);
            keys.push(item);
            var itemParams = selItem.citationParams || {};
            var keyObj = { id: item };
            if (itemParams.prefix) keyObj.prefix = itemParams.prefix;
            if (itemParams.suffix) keyObj.suffix = itemParams.suffix;
            if (itemParams.locatorValue) {
                keyObj.locator = itemParams.locatorValue;
                keyObj.label = itemParams.locatorType || "page";
            }
            if (itemParams.displayAs === "year_only") {
                keyObj["suppress-author"] = true;
            } else if (itemParams.displayAs === "author_only") {
                keyObj["author-only"] = true;
            }
            keyObj.displayMode = itemParams.displayAs || "default";
            if (itemParams.manualOverride) {
                keyObj.manualOverride = itemParams.manualOverride;
            }
            keysL.push(keyObj);
        }

        try {
            var formatter = new CSL.Engine({ retrieveLocale: function (id) { return locales[id]; }, retrieveItem: function (id) { return data[id]; } }, styles[selectedStyle], selectedLocale, true);
            formatter.updateItems(keys);

            var renderedText = "";
            var hasOverride = keysL.length === 1 && keysL[0].manualOverride;
            if (hasOverride) {
                renderedText = keysL[0].manualOverride;
            } else {
                // Handle Narrative Author (Year) vs Standard vs Suppress Author vs Author Only
                var hasNarrative = keysL.some(function(k) { return k.displayMode === "narrative"; });
                if (hasNarrative && keysL.length === 1) {
                    var singleKey = keysL[0];
                    var authorCluster = formatter.makeCitationCluster([{ id: singleKey.id, "author-only": true }]);
                    var yearCluster = formatter.makeCitationCluster([{
                        id: singleKey.id,
                        "suppress-author": true,
                        prefix: singleKey.prefix,
                        suffix: singleKey.suffix,
                        locator: singleKey.locator,
                        label: singleKey.label
                    }]);
                    var rawAuthor = (authorCluster && authorCluster.join) ? authorCluster.join('') : String(authorCluster || "");
                    var rawYear = (yearCluster && yearCluster.join) ? yearCluster.join('') : String(yearCluster || "");
                    renderedText = rawAuthor + " " + rawYear;
                } else {
                    renderedText = formatter.makeCitationCluster(keysL);
                }
            }

            var isNoteStyle = (formatter.opt && formatter.opt.class === "note") ||
                              (styles[selectedStyle] && styles[selectedStyle].indexOf('class="note"') !== -1);

            insertCitationContentControl(renderedText, keys, data, keysL, isNoteStyle);
        } catch (e) {
            showError(e);
        }
    }

    function insertCitationContentControl(renderedText, keys, cslDataMap, keysL, isNoteStyle) {
        var citationItems = keys.map(function(k, idx) {
            var kObj = (keysL && keysL[idx]) ? keysL[idx] : {};
            var itemPayload = {
                id: k,
                itemData: cslDataMap[k] || {}
            };
            if (kObj.prefix) itemPayload.prefix = kObj.prefix;
            if (kObj.suffix) itemPayload.suffix = kObj.suffix;
            if (kObj.locator) {
                itemPayload.locator = kObj.locator;
                itemPayload.label = kObj.label;
            }
            if (kObj["suppress-author"]) itemPayload["suppress-author"] = true;
            if (kObj["author-only"]) itemPayload["author-only"] = true;
            if (kObj.displayMode && kObj.displayMode !== "default") itemPayload.displayMode = kObj.displayMode;
            if (kObj.manualOverride) itemPayload.manualOverride = kObj.manualOverride;
            return itemPayload;
        });

        documentModule.insertCitation(citationItems, renderedText, isNoteStyle).catch(function(err) {
            showError("Failed to insert citation: " + (err.message || err));
        });
    }

    function insertInDocument(html) {
        if (!html) {
            showError(getMessage("Bibliography cannot be created with selected style"));
            return;
        }
        var rawHtml = (html && html.join) ? html.join("") : String(html || "");
        documentModule.getBibliography().then(function(bibRecord) {
            if (bibRecord && bibRecord.internalId) {
                return documentModule.updateBibliographyHtml(bibRecord.internalId, rawHtml);
            } else {
                return documentModule.insertBibliography(rawHtml);
            }
        }).catch(function(err) {
            console.warn("insertBibliography failed, falling back to PasteHtml:", err);
            try {
                window.Asc.plugin.executeMethod("PasteHtml", [rawHtml]);
            } catch (e) {
                showError("Failed to insert bibliography: " + (err.message || err));
            }
        });
    }

    function refreshDocumentCitations() {
        if (!selectedStyle || !styles[selectedStyle] || !selectedLocale || !locales[selectedLocale]) return;
        documentModule.getCitations().then(function(citationRecords) {
            if (!citationRecords || !citationRecords.length) return;
            var allDocCslItems = {};
            var allDocIds = [];

            citationRecords.forEach(function(cluster) {
                var cslItems = {};
                var ids = [];
                var keysList = [];
                cluster.citationItems.forEach(function(ci) {
                    cslItems[ci.id] = ci.itemData;
                    allDocCslItems[ci.id] = ci.itemData;
                    ids.push(ci.id);
                    if (allDocIds.indexOf(ci.id) === -1) allDocIds.push(ci.id);
                    var kObj = { id: ci.id };
                    if (ci.prefix) kObj.prefix = ci.prefix;
                    if (ci.suffix) kObj.suffix = ci.suffix;
                    if (ci.locator) {
                        kObj.locator = ci.locator;
                        kObj.label = ci.label || "page";
                    }
                    if (ci["suppress-author"]) kObj["suppress-author"] = true;
                    if (ci["author-only"]) kObj["author-only"] = true;
                    if (ci.displayMode) kObj.displayMode = ci.displayMode;
                    if (ci.manualOverride) kObj.manualOverride = ci.manualOverride;
                    keysList.push(kObj);
                });

                try {
                    var engine = new CSL.Engine({
                        retrieveLocale: function(l) { return locales[l]; },
                        retrieveItem: function(id) { return cslItems[id]; }
                    }, styles[selectedStyle], selectedLocale, true);
                    engine.updateItems(ids);

                    var formatted = "";
                    var hasOverride = keysList.length === 1 && keysList[0].manualOverride;
                    if (hasOverride) {
                        formatted = keysList[0].manualOverride;
                    } else {
                        var hasNarrative = keysList.some(function(k) { return k.displayMode === "narrative"; });
                        if (hasNarrative && keysList.length === 1) {
                            var singleKey = keysList[0];
                            var aClust = engine.makeCitationCluster([{ id: singleKey.id, "author-only": true }]);
                            var yClust = engine.makeCitationCluster([{
                                id: singleKey.id,
                                "suppress-author": true,
                                prefix: singleKey.prefix,
                                suffix: singleKey.suffix,
                                locator: singleKey.locator,
                                label: singleKey.label
                            }]);
                            var rA = (aClust && aClust.join) ? aClust.join('') : String(aClust || "");
                            var rY = (yClust && yClust.join) ? yClust.join('') : String(yClust || "");
                            formatted = rA + " " + rY;
                        } else {
                            formatted = engine.makeCitationCluster(keysList);
                        }
                    }

                    documentModule.updateCitationText(cluster.internalId, formatted);
                } catch(e) {
                    console.warn("Refresh citation block error:", e);
                }
            });

            if (allDocIds.length) {
                documentModule.getBibliography().then(function(bibRecord) {
                    if (!bibRecord) return;
                    try {
                        var engineBib = new CSL.Engine({
                            retrieveLocale: function(l) { return locales[l]; },
                            retrieveItem: function(id) { return allDocCslItems[id]; }
                        }, styles[selectedStyle], selectedLocale, true);
                        engineBib.updateItems(allDocIds);
                        var bibRes = engineBib.makeBibliography();
                        if (bibRes && bibRes[1]) {
                            documentModule.updateBibliographyHtml(bibRecord.internalId, bibRes[1]);
                        }
                    } catch(eb) {
                        console.warn("Refresh bibliography error:", eb);
                    }
                });
            }
        });
    }

    var allMendeleyDocsCache = [];
    function fetchAllMendeleyDocs() {
        if (allMendeleyDocsCache.length > 0) {
            return Promise.resolve(allMendeleyDocsCache);
        }
        var token = authFlow.getToken();
        if (!token) return Promise.resolve([]);

        return fetch("https://api.mendeley.com/documents?view=all&limit=200", {
            headers: {
                "Authorization": "Bearer " + token,
                "Accept": "application/vnd.mendeley-document.1+json"
            }
        })
        .then(function(r) { return r.json(); })
        .then(function(docs) {
            if (Array.isArray(docs)) {
                allMendeleyDocsCache = docs;
            }
            return allMendeleyDocsCache;
        })
        .catch(function() {
            return allMendeleyDocsCache;
        });
    }

    function findCitationsInTextAndLibrary(docText) {
        if (!docText || typeof docText !== "string") {
            return Promise.resolve({ cslItems: {}, ids: [] });
        }

        var citPattern = /\(([^\)]*?\b(19\d\d|20\d\d)\b[^\)]*?)\)/g;
        var targets = [];
        var match;
        while ((match = citPattern.exec(docText)) !== null) {
            var rawInside = match[1] || "";
            var yearMatch = rawInside.match(/\b(19\d\d|20\d\d)\b/);
            if (!yearMatch) continue;
            var year = parseInt(yearMatch[1], 10);
            var authorPart = rawInside.split(yearMatch[1])[0] || "";
            var authorWordMatch = authorPart.match(/([A-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F\.\-]+)/);
            var authorKeyword = authorWordMatch ? authorWordMatch[1].toLowerCase().replace(/[^a-z]/g, "") : "";
            if (authorKeyword && authorKeyword !== "et" && authorKeyword !== "al") {
                targets.push({ author: authorKeyword, year: year });
            }
        }

        if (!targets.length) {
            return Promise.resolve({ cslItems: {}, ids: [] });
        }

        return fetchAllMendeleyDocs().then(function(docs) {
            var cslItems = {};
            var ids = [];
            var seenIds = {};

            targets.forEach(function(t) {
                for (var i = 0; i < docs.length; i++) {
                    var d = docs[i];
                    if (!d || !d.id || seenIds[d.id]) continue;
                    var docYear = parseInt(d.year, 10);
                    if (docYear === t.year) {
                        var authors = d.authors || [];
                        var authorMatched = false;
                        for (var a = 0; a < authors.length; a++) {
                            var ln = (authors[a].last_name || authors[a].family || "").toLowerCase().replace(/[^a-z]/g, "");
                            if (ln && (ln.indexOf(t.author) !== -1 || t.author.indexOf(ln) !== -1)) {
                                authorMatched = true;
                                break;
                            }
                        }
                        if (authorMatched) {
                            seenIds[d.id] = true;
                            cslItems[d.id] = convertMendeleyToCSL(d);
                            ids.push(d.id);
                            break;
                        }
                    }
                }
            });

            return { cslItems: cslItems, ids: ids };
        });
    }

    function generateAndInsertBibliography(cslItems, ids) {
        try {
            var engine = new CSL.Engine({
                retrieveLocale: function(l) { return locales[l]; },
                retrieveItem: function(id) { return cslItems[id]; }
            }, styles[selectedStyle], selectedLocale, true);
            engine.updateItems(ids);
            var bibRes = engine.makeBibliography();
            showLoader(false);
            if (bibRes && bibRes[1]) {
                insertInDocument(bibRes[1]);
            } else {
                showError("Bibliography could not be generated with selected style");
            }
        } catch(e) {
            showLoader(false);
            showError(e);
        }
    }

    function insertBibliographyFromDocument() {
        if (!selectedStyle) selectedStyle = "apa";
        if (!selectedLocale) selectedLocale = "en-US";

        showLoader(true);
        Promise.all([getStyle(selectedStyle), getLocale(selectedLocale)]).then(function() {
            return documentModule.getCitations();
        }).then(function(citationRecords) {
            if (citationRecords && citationRecords.length) {
                var cslItems = {};
                var ids = [];
                citationRecords.forEach(function(cluster) {
                    if (cluster.citationItems) {
                        cluster.citationItems.forEach(function(ci) {
                            if (!cslItems[ci.id]) {
                                cslItems[ci.id] = ci.itemData;
                                ids.push(ci.id);
                            }
                        });
                    }
                });
                if (ids.length) {
                    generateAndInsertBibliography(cslItems, ids);
                    return;
                }
            }

            // Fallback 1: Scan document text for citations and match against Mendeley library
            return documentModule.getDocumentText().then(function(docText) {
                return findCitationsInTextAndLibrary(docText);
            }).then(function(matchedItems) {
                if (matchedItems && matchedItems.ids && matchedItems.ids.length) {
                    generateAndInsertBibliography(matchedItems.cslItems, matchedItems.ids);
                    return;
                }

                // Fallback 2: Check current sidebar selection
                if (selected.count() > 0) {
                    var cslData = {};
                    var keys = [];
                    for (var k in selected.items) {
                        cslData[k] = convertMendeleyToCSL(selected.items[k]);
                        keys.push(k);
                    }
                    generateAndInsertBibliography(cslData, keys);
                    return;
                }

                showLoader(false);
                showError("No citations found in document");
            });
        }).catch(function(err) {
            showLoader(false);
            showError("Failed to insert bibliography: " + (err.message || err));
        });
    }
    function unlinkAllCitations() {
        documentModule.unlinkAll().catch(function(err) {
            console.warn("Unlink all citations error:", err);
        });
    }

    function convertMendeleyWriter(csl, item, fieldTo, fieldFrom) {
        if (!item[fieldFrom] || item[fieldFrom].length <= 0) return;
        if (!csl[fieldTo]) csl[fieldTo] = [];

        for (var i = 0; i < item[fieldFrom].length; i++) {
            var writer = item[fieldFrom][i];
            if (writer) {
                csl[fieldTo].push({
                    given: writer.first_name || writer.given || "",
                    family: writer.last_name || writer.family || ""
                });
            }
        }
    }

    function convertMendeleyDate(csl, item, field) {
        if (!item.year) return;

        var date = [item.year];

        if (item.month) {
            date.push(item.month);
            if (item.day) {
                date.push(item.day);
            }
        }

        csl[field] = {
            "date-parts": [
                date
            ]
        };
    }

    function convertMendeleyToCSL(item) {
        var cslData = {};

        if (item.citation_key) {
            cslData.id = item.citation_key;
        } else {
            cslData.id = item.id;
        }

        cslData.type = convertMendeleyTypeToCSLType(item.type);

        convertMendeleyWriter(cslData, item, "author", "authors");

        convertMendeleyWriter(cslData, item, "editor", "editors");
        convertMendeleyWriter(cslData, item, "collection-editor", "editors");
        convertMendeleyWriter(cslData, item, "container-author", "editors");

        convertMendeleyWriter(cslData, item, "collection-editor", "series_editor");
        convertMendeleyWriter(cslData, item, "container-author", "series_editor");

        convertMendeleyWriter(cslData, item, "translators", "translators");

        convertMendeleyDate(cslData, item, "issued");
        convertMendeleyDate(cslData, item, "event-date");

        if (item.revision || item.series_number) {
            cslData.number = item.revision || item.series_number;
        }

        if (item.series || item.source) {
            cslData["container-title"] = item.series || item.source;
            cslData["collection-title"] = item.series || item.source;
        }

        if (item.type == "patent" && item.source) {
            cslData.publisher = item.source;
        } else if (item.publisher) {
            cslData.publisher = item.publisher;
        }

        if (item.identifiers) {
            if (item.identifiers.doi) cslData.DOI = item.identifiers.doi;
            if (item.identifiers.isbn) cslData.ISBN = item.identifiers.isbn;
            if (item.identifiers.issn) cslData.ISSN = item.identifiers.issn;
            if (item.identifiers.pmid) cslData.PMID = item.identifiers.pmid;
        }

        if (item.keywords) {
            cslData.keyword = item.keywords.toString();
        }

        if (item.websites && item.websites.length > 0) {
            cslData.URL = item.websites[0];
        }

        if (item.abstract) cslData.abstract = item.abstract;
        if (item.chapter) cslData["chapter-number"] = item.chapter;
        if (item.city) {
            cslData["event-place"] = item.city;
            cslData["publisher-place"] = item.city;
        }
        if (item.edition) cslData.edition = item.edition;
        if (item.genre) cslData.genre = item.genre;
        if (item.issue) cslData.issue = item.issue;
        if (item.language) cslData.language = item.language;
        if (item.medium) cslData.medium = item.medium;
        if (item.short_title) cslData["short-title"] = item.short_title;
        if (item.title) cslData.title = item.title;
        if (item.volume) cslData.volume = item.volume;

        return cslData;
    }

    function convertMendeleyTypeToCSLType(str) {
        str = str.toLowerCase();
        switch (str) {
            case "bill":
            case "book":
            case "patent":
            case "report":
            case "statute":
            case "thesis":
                return str;
            case "book_section":
                return "chapter";
            case "conference_proceedings":
                return "paper-conference";
            case "encyclopedia_article":
                return "entry-encyclopedia";
            case "film":
                return "motion_picture";
            case "hearing":
                return "speech";
            case "journal":
                return "article-journal";
            case "magazine_article":
                return "article-magazine";
            case "newspaper_article":
                return "article-newspaper";
            case "television_broadcast":
                return "broadcast";
            case "web_page":
                return "webpage";
            case "case":
            case "computer_program":
            case "generic":
            case "working_paper":
            default:
                return "article";
        }
    }

    function applyGlobalTheme(theme) {
        var styleId = "mendeley-dynamic-theme";
        var styleEl = document.getElementById(styleId);
        if (!styleEl) {
            styleEl = document.createElement("style");
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }

        var bgNormal = theme["background-normal"] || "#ffffff";
        var textNormal = theme["text-normal"] || "#333333";
        var bgToolbar = theme["background-toolbar"] || "#f4f4f4";
        var borderCtrl = theme["border-regular-control"] || "#cccccc";
        var bgHighlight = theme["highlight-button-hover"] || "#e0e0e0";
        var isDark = (theme.type && theme.type.indexOf("dark") !== -1) || theme.name === "theme-night" || bgNormal.toLowerCase() === "#333333" || bgNormal.toLowerCase() === "#282828";

        var css = "";
        css += "body, html, #content, #mainCont { background-color: " + bgNormal + " !important; color: " + textNormal + " !important; }\n";
        css += "#collectionDrawer, #editCitationDrawer, #mainState { background-color: " + bgNormal + " !important; color: " + textNormal + " !important; }\n";
        css += "#collectionSelectorBtn { background-color: " + (isDark ? bgToolbar : "#ffffff") + " !important; border-color: " + borderCtrl + " !important; color: " + textNormal + " !important; }\n";
        css += "#currentCollectionLabel { color: " + textNormal + " !important; }\n";
        css += "input.form-control, select.form-control, textarea.form-control { background-color: " + (isDark ? "#2d2d2d" : "#ffffff") + " !important; color: " + (isDark ? "#eeeeee" : "#222222") + " !important; border-color: " + borderCtrl + " !important; }\n";
        css += "select.form-control option { background-color: " + (isDark ? "#2d2d2d" : "#ffffff") + " !important; color: " + (isDark ? "#eeeeee" : "#222222") + " !important; }\n";
        css += "#drawerBackBtn, #editCitationBackBtn { border-color: " + borderCtrl + " !important; color: " + textNormal + " !important; }\n";
        css += ".doc { background-color: " + bgNormal + " !important; border-color: " + borderCtrl + " !important; color: " + textNormal + " !important; }\n";
        css += ".doc .docInfo div { color: " + textNormal + " !important; }\n";
        css += ".doc .secondary-text { opacity: 0.75 !important; }\n";
        css += "#buttonsWrapper { background-color: " + bgNormal + " !important; border-top: 1px solid " + borderCtrl + " !important; }\n";
        css += "#selectedWrapper { background-color: " + bgNormal + " !important; border-top: 1px solid " + borderCtrl + " !important; }\n";
        css += "#cancelBtn { background-color: " + (isDark ? bgToolbar : "#ffffff") + " !important; border-color: " + borderCtrl + " !important; color: " + textNormal + " !important; }\n";
        css += "#cancelCitationChangesBtn { background-color: " + (isDark ? bgToolbar : "#ffffff") + " !important; border-color: " + borderCtrl + " !important; color: " + textNormal + " !important; }\n";
        css += "#editCitationPreviewText { color: " + (isDark ? "#eeeeee" : "#111111") + " !important; }\n";
        css += ".selDoc { background-color: " + (isDark ? "#2d2d2d" : "#ffffff") + " !important; border-color: " + borderCtrl + " !important; color: " + (isDark ? "#64b5f6" : "#1a5276") + " !important; }\n";

        styleEl.textContent = css;
    }

})();
