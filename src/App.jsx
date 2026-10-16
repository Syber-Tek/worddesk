import React, { useEffect, useState, useRef, useCallback } from "react";
import PresentationOutputWindow from "./components/PresentationOutputWindow";
import StageDisplayWindow from "./components/StageDisplayWindow";
import IconRail from "./components/IconRail";
import Header from "./components/Header";
import CurrentNextRail from "./components/CurrentNextRail";
import HomeView from "./components/views/HomeView";
import BibleView from "./components/views/BibleView";
import SongsView from "./components/views/SongsView";
import PlanView from "./components/views/PlanView";
import SettingsView from "./components/views/SettingsView";
import AddItemModal from "./components/modals/AddItemModal";
import SplashScreen from "./components/SplashScreen";
import { stepScale, getFontScaleLabel } from "./lib/fontScale.js";
import { Toaster, toast } from "sonner";

import {
  resolveBookInList,
  normalizeBookName,
  matchBibleTranslation,
  extractTranslationFromRef,
  detectLanguageFromBook,
} from "./bibleBooks.js";
import { defaultFit } from "./lib/mediaKinds.js";
import usePresentationOutput from "./hooks/usePresentationOutput.js";

// Split a hymn's lyrics at blank lines into separate stanza slides so hymns can
// also be presented verse-by-verse (stanza-by-stanza) like scripture.
const splitHymnStanzas = (lyrics) => {
  if (!lyrics) return [""];
  return String(lyrics)
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
};

const buildHymnDeck = (item) => {
  const stanzas = splitHymnStanzas(item.content || item.lyrics);
  const hymnLabel = item.hymn_number
    ? `${String(item.category || "").includes("Methodist") ? "MH" : "PH"} ${item.hymn_number}`
    : "";
  return stanzas.map((s) => ({
    id: `hymn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: item.title || "Untitled",
    content: s,
    type: "Hymn",
    hymnLabel,
  }));
};

const THEME_MODE_KEY = "church_presenter_theme_mode";

const readThemeMode = () => {
  if (typeof window === "undefined" || !window.localStorage) return "dark";
  const saved = window.localStorage.getItem(THEME_MODE_KEY);
  return saved === "light" || saved === "system" ? saved : "dark";
};

const resolveEffectiveTheme = (mode) => {
  if (mode !== "system") return mode;
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

// The projector and stage windows return before the control window's theme code
// runs, so they have to apply data-theme themselves. They are separate
// BrowserWindows, so without this the CSS variables fall back to the dark
// palette and the standby screen ignores the operator's chosen theme.
function useOverlayTheme(isOverlayWindow) {
  useEffect(() => {
    if (!isOverlayWindow) return;
    const apply = () => {
      document.documentElement.setAttribute(
        "data-theme",
        resolveEffectiveTheme(readThemeMode()),
      );
    };
    apply();
    const media =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    const onChange = () => apply();
    media?.addEventListener("change", onChange);
    // Best effort: picks up a theme change made in the control window.
    window.addEventListener("storage", onChange);
    const unsubscribe = window.api?.onNativeThemeChanged?.(onChange);
    return () => {
      media?.removeEventListener("change", onChange);
      window.removeEventListener("storage", onChange);
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [isOverlayWindow]);
}

export default function App() {
  const isPresentationMode =
    typeof window !== "undefined" &&
    (window.location.search.includes("window=presentation") ||
      window.location.href.includes("window=presentation"));

  const isStageMode =
    typeof window !== "undefined" &&
    (window.location.search.includes("window=stage") ||
      window.location.href.includes("window=stage"));

  useOverlayTheme(isPresentationMode || isStageMode);

  if (isPresentationMode) {
    return <PresentationOutputWindow />;
  }

  if (isStageMode) {
    return <StageDisplayWindow />;
  }

  const [showSplash, setShowSplash] = useState(true);

  // Active Tab & Theme Mode state ('dark' | 'light' | 'system') persisted in localStorage
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("church_presenter_startup_tab");
      if (
        saved &&
        ["home", "plan", "bible", "songs", "settings"].includes(saved)
      )
        return saved;
    }
    return "home";
  });
  const [settingsSection, setSettingsSection] = useState("general");
  const [startupTab, setStartupTab] = useState(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("church_presenter_startup_tab");
      if (
        saved &&
        ["home", "plan", "bible", "songs", "settings"].includes(saved)
      )
        return saved;
    }
    return "home";
  });
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("church_presenter_theme_mode");
      if (saved === "dark" || saved === "light" || saved === "system")
        return saved;
    }
    return "dark";
  });

  const [systemTheme, setSystemTheme] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark",
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => setSystemTheme(e.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem("church_presenter_theme_mode", themeMode);
    }
  }, [themeMode]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem("church_presenter_startup_tab", startupTab);
    }
  }, [startupTab]);

  const effectiveTheme = themeMode === "system" ? systemTheme : themeMode;

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", effectiveTheme);
    }
  }, [effectiveTheme]);

  // Hand the raw theme MODE to the main process (not the resolved theme) so it
  // can own nativeTheme.themeSource. That way the OS title bar, native dialogs
  // and taskbar icon follow the in-app theme, and 'system' mode keeps tracking
  // the PC's own setting live via nativeTheme 'updated'.
  useEffect(() => {
    if (typeof window === "undefined" || !window.api?.setAppTheme) return;
    window.api.setAppTheme(themeMode).catch(() => {});
  }, [themeMode]);

  // The main process is the source of truth for the effective theme, so an OS
  // level change (day/night, manual PC switch) re-themes the app even when the
  // app is sitting on "system".
  useEffect(() => {
    if (typeof window === "undefined" || !window.api?.onNativeThemeChanged)
      return;
    const unsubscribe = window.api.onNativeThemeChanged(({ effectiveTheme: next }) => {
      if (next === "light" || next === "dark") setSystemTheme(next);
    });
    return typeof unsubscribe === "function" ? unsubscribe : undefined;
  }, []);

  // When the OS title bar is hidden the in-app header becomes the title bar, so
  // the header has to leave room for the native minimise/maximise/close buttons.
  const [hasTitleBarOverlay, setHasTitleBarOverlay] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.api?.getAppInfo) return;
    window.api
      .getAppInfo()
      .then((info) => setHasTitleBarOverlay(Boolean(info && info.hasTitleBarOverlay)))
      .catch(() => {});
  }, []);

  // Live Presentation & Transport State

  // Live Output Presentation Theme & Background State
  const [outputTheme, setOutputTheme] = useState(() => {
    return localStorage.getItem("church_presenter_output_theme") || "dark";
  });
  const [outputBgImage, setOutputBgImage] = useState(() => {
    return localStorage.getItem("church_presenter_output_bg_image") || "";
  });
  const [outputBgVideo, setOutputBgVideo] = useState(() => {
    return (
      localStorage.getItem("church_presenter_output_bg_video") ||
      "golden-particles"
    );
  });

  const [showVerseQuotes, setShowVerseQuotes] = useState(() => {
    return localStorage.getItem("church_presenter_show_quotes") !== "false";
  });

  const [appNamePosition, setAppNamePosition] = useState(() => {
    return localStorage.getItem("church_presenter_app_name_pos") || "top-left";
  });

  const [customHeaderTitle, setCustomHeaderTitle] = useState(() => {
    const val = localStorage.getItem("church_presenter_header_title");
    if (!val || val === "WorshipDesk" || val.toLowerCase() === "worshipdesk") {
      return "WordDesk";
    }
    return val;
  });

  const [uiScale, setUiScale] = useState(() => {
    return localStorage.getItem("church_presenter_ui_scale") || "normal";
  });

  const [slideMargin, setSlideMargin] = useState(() => {
    return localStorage.getItem("church_presenter_slide_margin") || "4rem";
  });

  const [attributionPosition, setAttributionPosition] = useState(() => {
    return localStorage.getItem("church_presenter_attribution_pos") || "bottom";
  });

  const [outputFontSize, setOutputFontSize] = useState(() => {
    return (
      localStorage.getItem("church_presenter_output_font_size") || "normal"
    );
  });

  const [defaultHymnCategory, setDefaultHymnCategory] = useState(() => {
    return localStorage.getItem("church_presenter_default_hymn_cat") || "All";
  });

  const [showHymnNumbers, setShowHymnNumbers] = useState(() => {
    return localStorage.getItem("church_presenter_show_hymn_nums") !== "false";
  });

  const [hymnTextScale, setHymnTextScale] = useState(() => {
    return localStorage.getItem("church_presenter_hymn_text_scale") || "normal";
  });

  const [isFullscreenActive, setFullscreenActive] = useState(() => {
    return localStorage.getItem("church_presenter_fullscreen") !== "false";
  });

  const [projectionDisplays, setProjectionDisplays] = useState(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const saved = JSON.parse(
          localStorage.getItem("church_presenter_projection_displays") || "[]",
        );
        return Array.isArray(saved) ? saved.map(Number) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem("church_presenter_output_theme", outputTheme);
  }, [outputTheme]);

  useEffect(() => {
    localStorage.setItem("church_presenter_output_bg_image", outputBgImage);
  }, [outputBgImage]);

  useEffect(() => {
    localStorage.setItem("church_presenter_output_bg_video", outputBgVideo);
  }, [outputBgVideo]);

  useEffect(() => {
    localStorage.setItem(
      "church_presenter_show_quotes",
      showVerseQuotes ? "true" : "false",
    );
  }, [showVerseQuotes]);

  useEffect(() => {
    localStorage.setItem("church_presenter_app_name_pos", appNamePosition);
  }, [appNamePosition]);

  useEffect(() => {
    localStorage.setItem("church_presenter_header_title", customHeaderTitle);
  }, [customHeaderTitle]);

  useEffect(() => {
    localStorage.setItem("church_presenter_ui_scale", uiScale);
  }, [uiScale]);

  useEffect(() => {
    localStorage.setItem("church_presenter_slide_margin", slideMargin);
  }, [slideMargin]);

  useEffect(() => {
    localStorage.setItem(
      "church_presenter_attribution_pos",
      attributionPosition,
    );
  }, [attributionPosition]);

  useEffect(() => {
    localStorage.setItem("church_presenter_output_font_size", outputFontSize);
  }, [outputFontSize]);

  useEffect(() => {
    localStorage.setItem(
      "church_presenter_default_hymn_cat",
      defaultHymnCategory,
    );
  }, [defaultHymnCategory]);

  useEffect(() => {
    localStorage.setItem(
      "church_presenter_show_hymn_nums",
      showHymnNumbers ? "true" : "false",
    );
  }, [showHymnNumbers]);

  useEffect(() => {
    localStorage.setItem("church_presenter_hymn_text_scale", hymnTextScale);
  }, [hymnTextScale]);

  useEffect(() => {
    localStorage.setItem(
      "church_presenter_projection_displays",
      JSON.stringify(projectionDisplays),
    );
  }, [projectionDisplays]);

  // Open/close projector windows so the selected displays receive live output.
  useEffect(() => {
    if (window.api && window.api.openPresentationWindows) {
      window.api.openPresentationWindows(projectionDisplays);
    }
  }, [projectionDisplays]);

  // Service Playlist State
  const [playlist, setPlaylist] = useState([]);
  const [recentPlans, setRecentPlans] = useState(() => {
    try {
      const saved =
        localStorage.getItem("worddesk_recent_plans") ||
        localStorage.getItem("worshipdesk_recent_plans");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const addRecentPlan = (entry) => {
    setRecentPlans((prev) => {
      const filtered = prev.filter((p) => p.filePath !== entry.filePath);
      const updated = [entry, ...filtered].slice(0, 10);
      localStorage.setItem("worddesk_recent_plans", JSON.stringify(updated));
      return updated;
    });
  };

  const handleSavePlanToFile = async () => {
    if (!playlist || playlist.length === 0) {
      toast.error("Your Service Order is empty. Add items to your playlist before saving.");
      return;
    }
    if (!window.api || !window.api.savePlanFile) return;
    const planPayload = {
      title: `Sunday Service Plan (${new Date().toLocaleDateString()})`,
      createdAt: new Date().toISOString(),
      itemsCount: playlist.length,
      playlist,
    };
    const res = await window.api.savePlanFile(planPayload);
    if (res && res.success) {
      addRecentPlan({
        filePath: res.filePath,
        fileName: res.fileName,
        title: planPayload.title,
        itemsCount: playlist.length,
        savedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        planPayload,
      });
      toast.success(`Service Plan saved successfully to ${res.fileName}`);
    }
  };

  const handleOpenPlanFromFile = async () => {
    if (!window.api || !window.api.openPlanFile) return;
    const res = await window.api.openPlanFile();
    if (res && res.success && res.plan) {
      const loadedPlaylist = res.plan.playlist || (Array.isArray(res.plan) ? res.plan : []);
      setPlaylist(loadedPlaylist);
      addRecentPlan({
        filePath: res.filePath,
        fileName: res.fileName,
        title: res.plan.title || res.fileName,
        itemsCount: loadedPlaylist.length,
        savedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        planPayload: res.plan,
      });
      toast.success(`Loaded "${res.fileName}" (${loadedPlaylist.length} items) into Service Order.`);
    }
  };

  const handleLoadRecentPlan = (recentEntry) => {
    if (!recentEntry || !recentEntry.planPayload) return;
    const loadedPlaylist =
      recentEntry.planPayload.playlist ||
      (Array.isArray(recentEntry.planPayload) ? recentEntry.planPayload : []);
    setPlaylist(loadedPlaylist);
    toast.success(`Loaded recent plan "${recentEntry.fileName || recentEntry.title}" into Service Order.`);
  };

  const handleClearPlan = () => {
    if (playlist.length === 0) return;
    setPlaylist([]);
    toast.info("Cleared Service Order playlist");
  };

  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemContent, setNewItemContent] = useState("");
  const [newItemType, setNewItemType] = useState("Bible Verse");
  const [missingMediaIds, setMissingMediaIds] = useState(() => new Set());
  // The playlist row currently open in the add/edit modal, or null when adding.
  const [editingItem, setEditingItem] = useState(null);

  // Hardware & System State
  const [appInfo, setAppInfo] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);
  const [displays, setDisplays] = useState([]);

  // Bible Scripture State
  const [biblesList, setBiblesList] = useState([]);
  const [allBooksList, setAllBooksList] = useState([]);
  const [selectedTranslation, setSelectedTranslation] = useState("NIV");
  const [selectedBook, setSelectedBook] = useState("John");
  const [selectedChapter, setSelectedChapter] = useState(3);
  const [searchQuery, setSearchQuery] = useState("");
  const [dbVerses, setDbVerses] = useState([]);
  const [selectedVerseIndex, setSelectedVerseIndex] = useState(0);
  // Parallel (secondary) translation for bilingual dual-view, lifted into the
  // control window so transport Present Next/Prev keep the parallel text.
  const [secondaryTranslation, setSecondaryTranslation] = useState("None");
  const [secondaryVerses, setSecondaryVerses] = useState([]);
  // Hymn stanza deck (set when presenting a hymn so it navigates stanza by stanza)
  const [hymnSearchQuery, setHymnSearchQuery] = useState("");
  const searchInputRef = useRef(null);

  // Fetch Bibles from SQLite on mount
  useEffect(() => {
    if (window.api && window.api.getBibles) {
      window.api.getBibles().then((list) => {
        if (list && list.length > 0) setBiblesList(list);
      });
    }
  }, []);

  // Re-fetch the Bible list after imports/deletes in Settings
  const refreshBibles = useCallback(() => {
    if (window.api && window.api.getBibles) {
      window.api.getBibles().then((list) => {
        if (list && list.length > 0) setBiblesList(list);
      });
    }
  }, []);

  // Fetch all books for active Bible translation
  useEffect(() => {
    if (!window.api) return;
    const activeBible =
      biblesList.find((b) => b.code === selectedTranslation) || biblesList[0];
    const bibleId = activeBible ? activeBible.id : 1;

    if (window.api.getBooks) {
      window.api.getBooks(bibleId).then((books) => {
        if (books && books.length > 0) {
          setAllBooksList(books);
          // Keep the selected book valid across translations (English <-> Twi).
          const normalized = normalizeBookName(selectedBook);
          const found =
            books.find((b) => normalizeBookName(b.name) === normalized) ||
            resolveBookInList(books, selectedBook, selectedTranslation);
          if (!found) {
            const target = books[0];
            if (target) {
              setSelectedBook(target.name);
              setSelectedChapter((prev) =>
                Math.min(prev || 1, target.chaptersCount || 1),
              );
              setSelectedVerseIndex(0);
            }
          } else if (normalizeBookName(found.name) !== normalized) {
            setSelectedBook(found.name);
            if (found.chaptersCount) {
              setSelectedChapter((prev) =>
                Math.min(prev || 1, found.chaptersCount),
              );
            }
            setSelectedVerseIndex(0);
          } else if (found.chaptersCount) {
            setSelectedChapter((prev) =>
              Math.min(prev || 1, found.chaptersCount),
            );
          }
        }
      });
    }
  }, [selectedTranslation, biblesList]);

  // Fetch verses dynamically from SQLite
  // (search is debounced so results keep up with fast typing instead of lagging behind)
  useEffect(() => {
    if (!window.api) return;

    const activeBible =
      biblesList.find((b) => b.code === selectedTranslation) || biblesList[0];
    const bibleId = activeBible ? activeBible.id : 1;

    let stale = false;
    const timer = setTimeout(
      () => {
        if (searchQuery.trim()) {
          if (window.api.searchVerses) {
            window.api
              .searchVerses(searchQuery.trim(), bibleId)
              .then((results) => {
                if (stale) return;
                if (results && results.length > 0) {
                  setDbVerses(
                    results.map((r) => ({
                      id: r.id,
                      ref: `${r.book_name || "Verse"} ${r.chapter}:${r.verse}`,
                      book: r.book_name || "Verse",
                      chapter: r.chapter,
                      verse: r.verse,
                      text: r.text,
                    })),
                  );
                } else {
                  setDbVerses([]);
                }
              });
          }
        } else {
          if (window.api.getBooks) {
            window.api.getBooks(bibleId).then((books) => {
              if (stale) return;
              if (!books || books.length === 0) return;
              const matchedBook =
                books.find(
                  (b) =>
                    normalizeBookName(b.name) ===
                    normalizeBookName(selectedBook),
                ) ||
                resolveBookInList(
                  books,
                  selectedBook,
                  selectedTranslation,
                );
              if (!matchedBook || !window.api.getVerses) return;
              window.api
                .getVerses(matchedBook.id, selectedChapter)
                .then((verses) => {
                  if (stale) return;
                  if (verses && verses.length > 0) {
                    setDbVerses(
                      verses.map((v) => ({
                        id: v.id,
                        ref: `${matchedBook.name} ${v.chapter}:${v.verse}`,
                        book: matchedBook.name,
                        chapter: v.chapter,
                        verse: v.verse,
                        text: v.text,
                      })),
                    );
                  } else {
                    setDbVerses([]);
                  }
                });
            });
          }
        }
      },
      searchQuery.trim() ? 250 : 0,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [
    searchQuery,
    selectedTranslation,
    selectedBook,
    selectedChapter,
    biblesList,
  ]);

  // Fetch identical verses from the parallel (secondary) translation when the
  // user enables a bilingual dual-view so transport Present Next/Prev can
  // carry the parallel text across slides.
  useEffect(() => {
    if (!secondaryTranslation || secondaryTranslation === "None" || !window.api) {
      setSecondaryVerses([]);
      return;
    }
    const secBible = biblesList.find((b) => b.code === secondaryTranslation);
    if (!secBible) return;

    // Guarded so a fast book/translation change cannot land an older response
    // on top of a newer selection, which is what left the parallel pane
    // showing a different book than the primary one.
    let stale = false;
    window.api.getBooks(secBible.id).then((books) => {
      if (stale) return;
      const targetBook = resolveBookInList(
        books,
        selectedBook,
        secondaryTranslation,
      );
      // No counterpart means no parallel text. Falling back to books[0] here
      // is what silently showed the wrong book next to the right label.
      if (!targetBook || !window.api.getVerses) return;
      const chapter = Math.min(
        selectedChapter || 1,
        targetBook.chaptersCount || selectedChapter || 1,
      );
      window.api.getVerses(targetBook.id, chapter).then((verses) => {
        if (stale) return;
        if (Array.isArray(verses)) {
          setSecondaryVerses(verses);
        }
      });
    });
    return () => {
      stale = true;
    };
  }, [secondaryTranslation, selectedBook, selectedChapter, biblesList]);

  // Attach the parallel translation text to a verse when available.
  const getVerseWithSecondary = (verse) => {
    if (!verse || secondaryTranslation === "None") return verse;
    const secMatch = secondaryVerses.find((v) => v.verse === verse.verse);
    if (secMatch && secMatch.text) {
      return {
        ...verse,
        secondaryText: secMatch.text,
        secondaryTranslation: secondaryTranslation,
        ref: `${verse.ref || `${selectedBook} ${selectedChapter}:${verse.verse}`} (${selectedTranslation} / ${secondaryTranslation})`,
      };
    }
    return verse;
  };

  useEffect(() => {
    if (window.api) {
      if (window.api.getAppInfo) window.api.getAppInfo().then(setAppInfo);
      if (window.api.getDbStatus) window.api.getDbStatus().then(setDbStatus);
      if (window.api.getDisplays) window.api.getDisplays().then(setDisplays);
      if (window.api.onDisplaysChanged) {
        const unsubscribe = window.api.onDisplaysChanged(setDisplays);
        return unsubscribe;
      }
    }
  }, []);

  useEffect(() => {
    if (activeTab === "bible" && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [activeTab]);

  // Once a real Bible is imported we never fall back to the demo verses,
  // so an empty search result correctly shows nothing instead of placeholder data.
  const hasRealBibles = biblesList && biblesList.length > 0;
  const filteredVerses = Array.isArray(dbVerses) ? dbVerses : [];

  const activeSelectedVerse =
    filteredVerses.length > 0
      ? filteredVerses[selectedVerseIndex] || filteredVerses[0]
      : null;

  const parseVerseReference = (refOrTitle) => {
    if (!refOrTitle || typeof refOrTitle !== "string") return null;
    const m = String(refOrTitle).match(
      /^([1-3]?\s*[\p{L}]+(?:\s+[\p{L}]+)*?)\s+(\d+)[:.](\d+)/iu,
    );
    if (m) {
      return {
        book: m[1].trim(),
        chapter: parseInt(m[2], 10),
        verse: parseInt(m[3], 10),
      };
    }
    return null;
  };

  const syncVerseContext = useCallback(
    async (item) => {
      if (!item || !window.api || !window.api.getBooks || !window.api.getVerses) {
        return null;
      }
      const parsed = parseVerseReference(item.ref || item.title);
      const bookName = item.book || parsed?.book;
      const chapterNum =
        item.chapter != null ? Number(item.chapter) : parsed?.chapter;
      const verseNum =
        item.verse != null ? Number(item.verse) : parsed?.verse;

      if (!bookName || !chapterNum) return null;

      // Extract translation from item or reference text (e.g. "Yohane 3:16 (TWIRV)" or "John 3:16 (EWE)")
      const extractedTrans =
        extractTranslationFromRef(item.ref) ||
        extractTranslationFromRef(item.title);
      // If no translation was explicitly given, detect from the book name itself (e.g. "Nnwom" -> "Twi")
      const detectedLang = !item.translation && !extractedTrans ? detectLanguageFromBook(bookName) : null;
      const targetTranslation =
        item.translation || extractedTrans || detectedLang || selectedTranslation;

      const primaryBible =
        matchBibleTranslation(biblesList, targetTranslation) ||
        (biblesList && biblesList[0]);
      if (!primaryBible) return null;

      // If the item belongs to a specific translation (e.g. TWI or EWE from a saved plan),
      // keep the presenter's active translation in sync so sequential navigation stays in the same Bible.
      if (primaryBible.code && primaryBible.code !== selectedTranslation) {
        setSelectedTranslation(primaryBible.code);
      }

      try {
        const books = await window.api.getBooks(primaryBible.id);
        if (!books || books.length === 0) return null;
        const matchedBook =
          books.find(
            (b) => normalizeBookName(b.name) === normalizeBookName(bookName),
          ) || resolveBookInList(books, bookName, primaryBible.code);
        if (!matchedBook) return null;

        const verses = await window.api.getVerses(matchedBook.id, chapterNum);
        if (!verses || verses.length === 0) return null;

        const mapped = verses.map((v) => ({
          id: v.id,
          ref: `${matchedBook.name} ${v.chapter}:${v.verse}`,
          book: matchedBook.name,
          chapter: v.chapter,
          verse: v.verse,
          text: v.text,
        }));

        setDbVerses(mapped);
        setSelectedBook(matchedBook.name);
        setSelectedChapter(chapterNum);

        const targetIndex = mapped.findIndex(
          (v) => Number(v.verse) === Number(verseNum),
        );
        const finalIndex = targetIndex >= 0 ? targetIndex : 0;
        setSelectedVerseIndex(finalIndex);

        if (
          secondaryTranslation &&
          secondaryTranslation !== "None" &&
          biblesList
        ) {
          const secBible = biblesList.find(
            (b) => b.code === secondaryTranslation,
          );
          if (secBible) {
            const secBooks = await window.api.getBooks(secBible.id);
            const secTargetBook = resolveBookInList(
              secBooks,
              matchedBook.name,
              secondaryTranslation,
            );
            if (secTargetBook) {
              const secV = await window.api.getVerses(
                secTargetBook.id,
                chapterNum,
              );
              if (Array.isArray(secV)) {
                setSecondaryVerses(secV);
              }
            }
          }
        }

        return { verses: mapped, index: finalIndex };
      } catch (err) {
        console.warn("syncVerseContext error:", err);
        return null;
      }
    },
    [biblesList, selectedTranslation, secondaryTranslation],
  );

  // The presentation engine owns what is on air. Kept in one place so a slide
  // cannot be shaped differently by two different present paths.
  const {
    currentSlide,
    nextSlide,
    isLive,
    isBlack,
    isBlank,
    hymnDeck,
    hymnDeckIndex,
    setCurrentSlide,
    setNextSlide,
    setIsLive,
    setIsBlack,
    setIsBlank,
    setHymnDeck,
    setHymnDeckIndex,
    normalizeSlide,
    mediaOverrides,
    broadcastToPresentation,
    mediaPage,
    mediaPageCount,
    setMediaPageCount,
    isPagingPdf,
    handleReplayVideo,
    handleSelectItem,
    handleStageNext,
    handlePresentItemNow,
    handlePresentNow,
    handleTransportPresent,
    handleTransportStop,
    handleToggleBlack,
    handleToggleClear,
    handleTransportPrev,
    handleTransportNext,
    handleTransportPresentNext,
    handleTransportPresentPrev,
  } = usePresentationOutput({
    playlist,
    setPlaylist,
    filteredVerses,
    selectedVerseIndex,
    setSelectedVerseIndex,
    selectedTranslation,
    getVerseWithSecondary,
    buildHymnDeck,
    syncVerseContext,
    outputTheme,
    outputBgImage,
    outputBgVideo,
    showVerseQuotes,
    appNamePosition,
    customHeaderTitle,
    slideMargin,
    attributionPosition,
    outputFontSize,
    hymnTextScale,
  });

  // ---------------------------------------------------------------------
  // Playlist handlers. These own the service plan itself, as opposed to the
  // presentation engine above, which only decides what is on air.
  // ---------------------------------------------------------------------

  const handleAddToPlaylist = async (item) => {
    const slide = normalizeSlide(item);
    if (!slide || !slide.title.trim() || !slide.content.trim()) {
      toast.error("Cannot add empty item to Service Plan");
      return;
    }
    const newItem = { ...slide, id: `item-${Date.now()}`, status: "pending" };
    setPlaylist((prev) => [...prev, newItem]);
    toast.success(`Added "${slide.title || "item"}" to Service Plan`);

    // When a hymn or Bible verse is added, also prepare next slide so "Present Next"
    // immediately shows the next Bible verse (e.g. Matthew 3:16 -> 17) or next hymn stanza.
    if (slide.type === "Hymn") {
      const slides = buildHymnDeck(slide);
      setHymnDeck(slides);
      setHymnDeckIndex(0);
      const firstSlide = slides[0] || slide;
      const followingSlide = slides.length > 1 ? slides[1] : {};
      if (!isLive) {
        setCurrentSlide(firstSlide);
        setNextSlide(followingSlide);
      } else {
        setNextSlide(followingSlide.title ? followingSlide : firstSlide);
      }
    } else if (slide.type === "Bible Verse" && syncVerseContext) {
      setHymnDeck([]);
      setHymnDeckIndex(0);
      const ctx = await syncVerseContext(slide);
      const verses = ctx?.verses;
      const vIndex = ctx?.index != null ? ctx.index : 0;
      const liveVerse = verses && verses[vIndex] ? getVerseWithSecondary(verses[vIndex]) : slide;
      const nextVerse = verses && verses[vIndex + 1] ? getVerseWithSecondary(verses[vIndex + 1]) : null;

      const liveSlideObj = {
        id: `verse-${liveVerse.id || Date.now()}`,
        title: liveVerse.ref || slide.title || "",
        content: slide.content || liveVerse.text || liveVerse.content || "",
        secondaryText: liveVerse.secondaryText || "",
        secondaryTranslation: liveVerse.secondaryTranslation || "",
        type: "Bible Verse",
        book: liveVerse.book || slide.book,
        chapter: liveVerse.chapter != null ? liveVerse.chapter : slide.chapter,
        verse: liveVerse.verse != null ? liveVerse.verse : slide.verse,
      };

      const nextSlideObj = nextVerse
        ? {
            id: `verse-${nextVerse.id}`,
            title: nextVerse.ref || "",
            content: nextVerse.text || "",
            secondaryText: nextVerse.secondaryText || "",
            secondaryTranslation: nextVerse.secondaryTranslation || "",
            type: "Bible Verse",
            book: nextVerse.book,
            chapter: nextVerse.chapter,
            verse: nextVerse.verse,
          }
        : {};

      if (!isLive) {
        setCurrentSlide(liveSlideObj);
        setNextSlide(nextSlideObj);
      } else {
        setNextSlide(nextSlideObj.title ? nextSlideObj : liveSlideObj);
      }
    }
  };

  // Global shortcuts for the control window. Ignores typing targets so the arrow
  // keys and space still behave normally inside a text field.
  const handleKeyDown = (e) => {
    // Projector text size is handled before the typing-target guard on purpose:
    // resizing the projected text is exactly what you want to do while the
    // cursor is still in the verse search box.
    if (e.ctrlKey || e.metaKey) {
      const delta = e.key === "[" || e.key === "{" ? -1 : e.key === "]" || e.key === "}" ? 1 : 0;
      if (delta !== 0) {
        e.preventDefault();
        const next = stepScale(outputFontSize, delta);
        setOutputFontSize(next);
        toast.info(`Projector text size: ${getFontScaleLabel(next)}`);
        return;
      }
    }

    const tag =
      e.target && e.target.tagName ? e.target.tagName.toUpperCase() : "";
    if (
      /INPUT|TEXTAREA|SELECT/.test(tag) ||
      (e.target && e.target.isContentEditable)
    )
      return;
    if (tag === "BUTTON" || tag === "A") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedVerseIndex((prev) =>
        prev < filteredVerses.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedVerseIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      handleTransportPresentNext();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      handleTransportPresentPrev();
    } else if (e.key === " ") {
      e.preventDefault();
      if (activeSelectedVerse) handlePresentNow(activeSelectedVerse);
    }
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const updated = [...playlist];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    setPlaylist(updated);
    toast.info("Reordered Service Plan item");
  };

  const handleMoveDown = (index) => {
    if (index === playlist.length - 1) return;
    const updated = [...playlist];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    setPlaylist(updated);
    toast.info("Reordered Service Plan item");
  };

  const handleReorderPlaylist = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setPlaylist((prev) => {
      if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
    toast.info("Reordered Service Plan item");
  };

  // Open the add/edit modal on an existing row, or route to Bible/Songs tab to change scriptures and hymns.
  const handleOpenEdit = (item) => {
    if (!item) {
      setEditingItem(null);
      setShowAddModal(false);
      return;
    }

    // If editing a Bible Verse, navigate directly to the Bible tab loaded with this scripture
    const isVerse =
      item.type === "Bible Verse" || !!item.ref || (item.book && item.chapter);
    if (isVerse) {
      const parsed = parseVerseReference(item.ref || item.title);
      const bName = item.book || parsed?.book;
      const chNum = item.chapter != null ? Number(item.chapter) : parsed?.chapter;
      const vNum = item.verse != null ? Number(item.verse) : parsed?.verse;

      const extractedTrans =
        extractTranslationFromRef(item.ref) ||
        extractTranslationFromRef(item.title);
      const detectedLang = !item.translation && !extractedTrans ? detectLanguageFromBook(bName) : null;
      const targetTranslation =
        item.translation || extractedTrans || detectedLang || selectedTranslation;

      const primaryBible =
        matchBibleTranslation(biblesList, targetTranslation) ||
        (biblesList && biblesList[0]);

      if (primaryBible?.code) {
        setSelectedTranslation(primaryBible.code);
      }
      if (bName) {
        setSelectedBook(bName);
      }
      if (chNum) {
        setSelectedChapter(chNum);
      }
      if (vNum != null) {
        setSelectedVerseIndex(Math.max(0, vNum - 1));
      }
      setSearchQuery("");
      setActiveTab("bible");
      toast.info(`Navigated to Bible reader for "${item.title || "scripture"}"`);
      return;
    }

    // If editing a Hymn, navigate directly to the Songs tab loaded with this hymn
    if (item.type === "Hymn") {
      const query = item.hymn_number
        ? String(item.hymn_number)
        : (item.title || "").replace(/^(?:PH|MH)\s*\d+[\s:–—-]*/i, "").trim();
      setHymnSearchQuery(query);
      setActiveTab("songs");
      toast.info(`Navigated to Hymn library for "${item.title || "hymn"}"`);
      return;
    }

    // For custom slides, announcements, and sermon notes, open the custom slide editor modal
    setEditingItem(item);
    setNewItemTitle(item.title || "");
    setNewItemContent(item.content || "");
    setNewItemType(item.type || "Custom Slide");
    setShowAddModal(true);
  };

  // Save changes back onto the row. A null payload just closes the modal, which
  // is how Cancel and the backdrop are wired.
  const handleEditItem = (payload) => {
    if (!payload) {
      handleOpenEdit(null);
      return;
    }
    setPlaylist((prev) =>
      prev.map((i) => (i.id === editingItem?.id ? { ...i, ...payload } : i)),
    );
    handleOpenEdit(null);
    toast.success(`Updated "${payload.title || "item"}"`);
  };

  const handleDeleteItem = (id) => {    setPlaylist((prev) => prev.filter((i) => i.id !== id));
    toast.info("Removed item from Service Plan");
  };

  // Submit handler behind the add-custom-slide modal.
  const handleAddItem = (e, customData = null) => {
    if (e && e.preventDefault) e.preventDefault();
    if (customData) {
      setPlaylist((prev) => [
        ...prev,
        {
          id: `item-${Date.now()}`,
          status: "pending",
          ...customData,
        },
      ]);
      setNewItemTitle("");
      setNewItemContent("");
      setShowAddModal(false);
      toast.success(`Added "${customData.title || "item"}" to Service Plan`);
      return;
    }
    if (!newItemTitle.trim() || !newItemContent.trim()) {
      toast.error("A slide needs both a title and some text");
      return;
    }
    setPlaylist((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        title: newItemTitle.trim(),
        content: newItemContent.trim(),
        type: newItemType,
        status: "pending",
      },
    ]);
    setNewItemTitle("");
    setNewItemContent("");
    setShowAddModal(false);
    toast.success(`Added "${newItemTitle.trim()}" to Service Plan`);
  };

  // Add one playlist item per picked file. The title is the original filename
  // purely so the operator can recognise it in the plan; the output window
  // deliberately never shows it on air.
  const handleAddMediaItems = (mediaList, { fit, muted } = {}) => {
    if (!mediaList || mediaList.length === 0) return;
    const items = mediaList.map((entry, i) => ({
      id: `media-${Date.now()}-${i}`,
      title: entry.sourceName || entry.storedName,
      content: "",
      type: "Media Slide",
      mediaType: entry.kind,
      mediaName: entry.storedName,
      mediaFit: fit || defaultFit(entry.kind),
      mediaMuted: muted !== false,
      status: "pending",
    }));
    setPlaylist((prev) => [...prev, ...items]);
    setShowAddModal(false);
    toast.success(
      `Added ${items.length} media slide${items.length === 1 ? "" : "s"}`,
    );
  };

  // Point a missing media item at the file again. The main process stores the
  // replacement and hands back the new stored name.
  const handleRelinkMedia = async (itemId) => {
    const target = playlist.find((i) => i.id === itemId);
    if (!target) return;
    try {
      const result = await window.api.relinkMedia(target.mediaName);
      if (!result || !result.success) {
        if (result && result.message && result.message !== "Cancelled") {
          toast.error(result.message);
        }
        return;
      }
      setPlaylist((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? {
                ...i,
                mediaName: result.storedName,
                mediaType: result.kind,
                title: result.sourceName || i.title,
              }
            : i,
        ),
      );
      setMissingMediaIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      toast.success(`Relinked "${target.title}"`);
    } catch (err) {
      toast.error(String((err && err.message) || err));
    }
  };

  // Flag any media item whose stored file has gone missing, so the planner can
  // show a Relink button before the item is ever put on air.
  useEffect(() => {
    const mediaNames = playlist
      .map((i) => i.mediaName)
      .filter((name) => typeof name === "string" && name && !name.startsWith("http://") && !name.startsWith("https://"));
    if (mediaNames.length === 0) {
      setMissingMediaIds(new Set());
      return;
    }
    let cancelled = false;
    window.api
      .resolveMediaUrls(mediaNames)
      .then((map) => {
        if (cancelled) return;
        const missing = new Set();
        playlist.forEach((item) => {
          if (item.mediaName && !item.mediaUrl && map && map[item.mediaName]?.exists === false) {
            missing.add(item.id);
          }
        });
        setMissingMediaIds(missing);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [playlist]);


  // Arrows pressed on the projector window advance the verse deck here.
  useEffect(() => {
    if (window.api && window.api.onDeckNav) {
      const unsubscribe = window.api.onDeckNav((dir) => {
        if (dir === "next") handleTransportPresentNext();
        else if (dir === "prev") handleTransportPresentPrev();
      });
      return unsubscribe;
    }
  }, [handleTransportPresentNext, handleTransportPresentPrev]);

  // Global Keyboard Shortcut Handler (Works 100% reliably anywhere in window)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : "";
      const isInput =
        /INPUT|TEXTAREA|SELECT/.test(tag) ||
        (e.target && e.target.isContentEditable);

      if (e.key === "Escape") {
        if (document.activeElement && document.activeElement.blur) {
          document.activeElement.blur();
        }
        return;
      }

      if (
        (e.ctrlKey && e.key.toLowerCase() === "f") ||
        (!isInput && e.key === "/")
      ) {
        e.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
        return;
      }

      if (isInput) return;

      const key = e.key.toLowerCase();

      // Quick Tab Switcher: 1-5
      if (e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const tabMap = {
          "1": "home",
          "2": "plan",
          "3": "bible",
          "4": "songs",
          "5": "settings",
        };
        if (tabMap[e.key]) {
          setActiveTab(tabMap[e.key]);
          toast.info(`Switched to ${tabMap[e.key].toUpperCase()} view`);
        }
        return;
      }

      // Live Transport Control Shortcuts
      if (key === "b") {
        e.preventDefault();
        handleToggleBlack();
      } else if (key === "c") {
        e.preventDefault();
        handleToggleClear();
      } else if (key === "p" || e.key === "Enter") {
        e.preventDefault();
        if (nextSlide && nextSlide.title) {
          handleTransportPresent();
        } else if (activeSelectedVerse) {
          handlePresentNow(getVerseWithSecondary(activeSelectedVerse));
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedVerseIndex((prev) =>
          prev < filteredVerses.length - 1 ? prev + 1 : prev,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedVerseIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        handleTransportPresentNext();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        handleTransportPresentPrev();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    activeTab,
    filteredVerses,
    selectedVerseIndex,
    activeSelectedVerse,
    nextSlide,
    secondaryTranslation,
    secondaryVerses,
    handleTransportPresentNext,
    handleTransportPresentPrev,
    handleTransportPresent,
    handleToggleBlack,
    handleToggleClear,
    handlePresentNow,
  ]);

  const isHymnDeckActive = hymnDeck.length > 1 && currentSlide?.type === "Hymn";
  const hasNextSlide = !!(
    nextSlide &&
    (nextSlide.title ||
      nextSlide.content ||
      nextSlide.ref ||
      nextSlide.text ||
      nextSlide.mediaName ||
      nextSlide.mediaUrl ||
      nextSlide.youtubeId)
  );
  const presentNextDisabled = isHymnDeckActive
    ? hymnDeckIndex >= hymnDeck.length - 1
    : hasNextSlide
      ? false
      : !isLive ||
        selectedVerseIndex >= filteredVerses.length - 1 ||
        filteredVerses.length === 0;
  const presentPrevDisabled = isHymnDeckActive
    ? hymnDeckIndex <= 0
    : selectedVerseIndex <= 0;

  return (
    <div
      className={`flex flex-col h-screen font-sans overflow-hidden select-none transition-colors duration-200 ${
        effectiveTheme === "light"
          ? "bg-[#F4F5F7] text-[#111827]"
          : "bg-bg text-text-primary"
      }`}
      style={{
        fontSize:
          uiScale === "compact"
            ? "12px"
            : uiScale === "large"
              ? "14px"
              : "13px",
      }}
      onKeyDown={handleKeyDown}
    >
      {/* 1. FULL-WIDTH CUSTOM TITLE BAR (native caption buttons overlay its right) */}
      <Header
        displays={displays}
        isLive={isLive}
        setIsLive={setIsLive}
        broadcastToPresentation={broadcastToPresentation}
        themeMode={themeMode}
        effectiveTheme={effectiveTheme}
        setThemeMode={setThemeMode}
        hasTitleBarOverlay={hasTitleBarOverlay}
      />

      {/* 2. WORKSPACE ROW */}
      <div className="flex flex-1 min-h-0">
      {/* 2.1 ICON RAIL (Fixed 52px width) */}
      <IconRail
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        themeMode={effectiveTheme}
      />

      {/* 2.2 CENTER WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* MAIN ROUTED VIEW CONTENT AREA */}
        <main className="flex-1 overflow-y-auto p-5 text-xs">
          {activeTab === "home" && (
            <HomeView
              setActiveTab={setActiveTab}
              playlist={playlist}
              biblesList={biblesList}
              displays={displays}
              isLive={isLive}
              currentSlide={currentSlide}
              nextSlide={nextSlide}
              handlePresentNow={handlePresentItemNow}
              handleStageNext={handleSelectItem}
              themeMode={effectiveTheme}
            />
          )}

          {activeTab === "bible" && (
            <BibleView
              biblesList={biblesList}
              allBooksList={allBooksList}
              selectedTranslation={selectedTranslation}
              setSelectedTranslation={setSelectedTranslation}
              selectedBook={selectedBook}
              setSelectedBook={setSelectedBook}
              selectedChapter={selectedChapter}
              setSelectedChapter={setSelectedChapter}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              selectedVerseIndex={selectedVerseIndex}
              setSelectedVerseIndex={setSelectedVerseIndex}
              searchInputRef={searchInputRef}
              filteredVerses={filteredVerses}
              activeSelectedVerse={activeSelectedVerse}
              handleStageNext={handleStageNext}
              handlePresentNow={handlePresentNow}
              handleAddToPlaylist={handleAddToPlaylist}
              themeMode={effectiveTheme}
              secondaryTranslation={secondaryTranslation}
              setSecondaryTranslation={setSecondaryTranslation}
              secondaryVerses={secondaryVerses}
            />
          )}

          {activeTab === "songs" && (
            <SongsView
              handleStageNext={handleStageNext}
              handlePresentNow={handlePresentNow}
              handleAddToPlaylist={handleAddToPlaylist}
              themeMode={effectiveTheme}
              defaultHymnCategory={defaultHymnCategory}
              showHymnNumbers={showHymnNumbers}
              hymnTextScale={hymnTextScale}
              hymnSearchQuery={hymnSearchQuery}
              setHymnSearchQuery={setHymnSearchQuery}
            />
          )}

          {activeTab === "plan" && (
            <PlanView
              playlist={playlist}
              setShowAddModal={setShowAddModal}
              handleSelectItem={handleSelectItem}
              handlePresentItemNow={handlePresentItemNow}
              handleMoveUp={handleMoveUp}
              handleMoveDown={handleMoveDown}
              handleReorderPlaylist={handleReorderPlaylist}
              handleDeleteItem={handleDeleteItem}
              missingMediaIds={missingMediaIds}
              handleRelinkMedia={handleRelinkMedia}
              handleEditItem={handleOpenEdit}
              recentPlans={recentPlans}
              handleSavePlanToFile={handleSavePlanToFile}
              handleOpenPlanFromFile={handleOpenPlanFromFile}
              handleLoadRecentPlan={handleLoadRecentPlan}
              handleClearPlan={handleClearPlan}
              themeMode={effectiveTheme}
            />
          )}

          {activeTab === "settings" && (
            <SettingsView
              settingsSection={settingsSection}
              setSettingsSection={setSettingsSection}
              startupTab={startupTab}
              setStartupTab={setStartupTab}
              appInfo={appInfo}
              dbStatus={dbStatus}
              displays={displays}
              setDisplays={setDisplays}
              projectionDisplays={projectionDisplays}
              setProjectionDisplays={setProjectionDisplays}
              selectedTranslation={selectedTranslation}
              setSelectedTranslation={setSelectedTranslation}
              themeMode={themeMode}
              effectiveTheme={effectiveTheme}
              setThemeMode={setThemeMode}
              biblesList={biblesList}
              refreshBibles={refreshBibles}
              outputTheme={outputTheme}
              setOutputTheme={setOutputTheme}
        mediaPage={mediaPage}
        mediaPageCount={mediaPageCount}
        isPagingPdf={isPagingPdf}
        onMediaPageCount={setMediaPageCount}
        onReplayVideo={handleReplayVideo}
              outputBgImage={outputBgImage}
              setOutputBgImage={setOutputBgImage}
              outputBgVideo={outputBgVideo}
              setOutputBgVideo={setOutputBgVideo}
              showVerseQuotes={showVerseQuotes}
              setShowVerseQuotes={setShowVerseQuotes}
              appNamePosition={appNamePosition}
              setAppNamePosition={setAppNamePosition}
              customHeaderTitle={customHeaderTitle}
              setCustomHeaderTitle={setCustomHeaderTitle}
              uiScale={uiScale}
              setUiScale={setUiScale}
              slideMargin={slideMargin}
              setSlideMargin={setSlideMargin}
              attributionPosition={attributionPosition}
              setAttributionPosition={setAttributionPosition}
              outputFontSize={outputFontSize}
              setOutputFontSize={setOutputFontSize}
              defaultHymnCategory={defaultHymnCategory}
              setDefaultHymnCategory={setDefaultHymnCategory}
              showHymnNumbers={showHymnNumbers}
              setShowHymnNumbers={setShowHymnNumbers}
              hymnTextScale={hymnTextScale}
              setHymnTextScale={setHymnTextScale}
              isFullscreenActive={isFullscreenActive}
              setFullscreenActive={setFullscreenActive}
            />
          )}
        </main>
      </div>

      {/* 2.3 CURRENT / NEXT RAIL & TRANSPORT CONTROLS */}
      <CurrentNextRail
        currentSlide={currentSlide}
        nextSlide={nextSlide}
        isLive={isLive}
        isBlack={isBlack}
        isBlank={isBlank}
        selectedVerseIndex={selectedVerseIndex}
        filteredVersesLength={filteredVerses.length}
        hymnDeckActive={isHymnDeckActive}
        presentNextDisabled={presentNextDisabled}
        presentPrevDisabled={presentPrevDisabled}
        handleTransportPrev={handleTransportPrev}
        handleTransportNext={handleTransportNext}
        handleTransportPresentNext={handleTransportPresentNext}
        handleTransportPresentPrev={handleTransportPresentPrev}
        handleToggleClear={handleToggleClear}
        handleToggleBlack={handleToggleBlack}
        handleTransportPresent={handleTransportPresent}
        handleTransportStop={handleTransportStop}
        themeMode={effectiveTheme}
        displays={displays}
        projectionDisplays={projectionDisplays}
        setProjectionDisplays={setProjectionDisplays}
        outputTheme={outputTheme}
        setOutputTheme={setOutputTheme}
        outputFontSize={outputFontSize}
        setOutputFontSize={setOutputFontSize}
        mediaPage={mediaPage}
        mediaPageCount={mediaPageCount}
        isPagingPdf={isPagingPdf}
        onMediaPageCount={setMediaPageCount}
        onReplayVideo={handleReplayVideo}
      />
      </div>

      {/* ADD ITEM MODAL */}
      <AddItemModal
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        newItemTitle={newItemTitle}
        setNewItemTitle={setNewItemTitle}
        newItemContent={newItemContent}
        setNewItemContent={setNewItemContent}
          newItemType={newItemType}
          setNewItemType={setNewItemType}
          handleAddItem={handleAddItem}
          handleAddMediaItems={handleAddMediaItems}
        onEdit={handleEditItem}
        editingItem={editingItem}
        themeMode={effectiveTheme}
      />

      {showSplash && (
        <SplashScreen
          themeMode={effectiveTheme}
          onFinished={() => setShowSplash(false)}
        />
      )}

      <Toaster
        position="top-center"
        visibleToasts={1}
        theme={effectiveTheme === "light" ? "light" : "dark"}
        richColors
        closeButton
        offset={16}
        containerStyle={{ zIndex: 99999 }}
        toastOptions={{
          style: {
            fontFamily: "'Plus Jakarta Sans', ui-sans-serif, sans-serif",
            zIndex: 99999,
          },
        }}
      />
    </div>
  );
}
