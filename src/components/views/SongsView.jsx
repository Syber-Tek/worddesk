import React, { useState, useEffect } from "react";
import {
  Search,
  Show,
  Send,
  Plus,
  Category,
  Document,
} from "react-iconly";
import { FaMusic, FaPlus } from "react-icons/fa6";
import {
  ALL_HYMN_CATEGORIES,
  loadHymnCategories,
  resolveHymnCategory,
} from "../../lib/hymnCategories";
export default function SongsView({
  handleStageNext,
  handlePresentNow,
  handleAddToPlaylist,
  themeMode,
  defaultHymnCategory = "All",
  showHymnNumbers = true,
  hymnTextScale = "normal",
}) {
  const isLight = themeMode === "light";
  const [hymnsList, setHymnsList] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(
    ALL_HYMN_CATEGORIES,
  );
  // The unfiltered option, plus whatever the database actually holds. The
  // fallback list lives in src/lib/hymnCategories.js so it cannot drift from the
  // one the Settings dropdown uses - when the two disagreed, choosing a default
  // category stored a string that matched no hymn and this tab came up empty.
  //
  // Declared with the other state, not further down: the effect below reads it in
  // its dependency array, which is evaluated during render, so referencing it
  // before this line throws "Cannot access 'categories' before initialization"
  // and takes the whole page down.
  const [categories, setCategories] = useState(["All"]);
  const [selectedHymn, setSelectedHymn] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lyricsCache, setLyricsCache] = useState({});

  // Re-applied when the categories arrive as well as when the setting changes:
  // a stored value that is not one of them filters the list down to nothing, so
  // it falls back to All instead of opening on an empty tab.
  useEffect(() => {
    setSelectedCategory(resolveHymnCategory(defaultHymnCategory, categories));
  }, [defaultHymnCategory, categories]);

  const cardClass = isLight
    ? "bg-[#FFFFFF] border-[#E5E7EB] text-[#111827] shadow-sm"
    : "bg-[#151619] border-border text-text-primary";

  const innerCardClass = isLight
    ? "bg-[#F9FAFB] border-[#E5E7EB]"
    : "bg-[#1B1C20] border-border";

  const labelClass = isLight ? "text-[#6B7280]" : "text-text-secondary";
  const headingClass = isLight ? "text-[#111827]" : "text-text-primary";

  const loadCategories = async () => {
    setCategories(await loadHymnCategories());
  };

  useEffect(() => {
    loadCategories();
  }, []);


  const hymnLabel = (hymn) => {
    if (!showHymnNumbers) return "Hymn";
    return hymn.hymn_number > 0
      ? `${String(hymn.category || "").includes("Methodist") ? "MH" : "PH"} ${hymn.hymn_number}`
      : "Hymn";
  };

  useEffect(() => {
    fetchHymns(searchQuery, selectedCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, selectedCategory]);

  // Loads full lyrics for the selected hymn once (cached per hymn id).
  const loadLyrics = async (hymn) => {
    if (!hymn || lyricsCache[hymn.id]) return;
    if (window.api && window.api.getHymnLyrics) {
      try {
        const full = await window.api.getHymnLyrics(hymn.id);
        if (full && full.lyrics) {
          setLyricsCache((prev) => ({ ...prev, [hymn.id]: full.lyrics }));
        }
      } catch (err) {
        console.error("Failed to load hymn lyrics:", err);
      }
    }
  };

  const handleSelectHymn = (hymn) => {
    setSelectedHymn(hymn);
    loadLyrics(hymn);
  };

  const fetchHymns = async (query, cat) => {
    setIsLoading(true);
    try {
      if (window.api && window.api.listHymns) {
        const results = await window.api.listHymns(
          query,
          cat === "All" ? null : cat,
        );
        if (Array.isArray(results)) {
          setHymnsList(results);
          const keep =
            selectedHymn && results.some((h) => h.id === selectedHymn.id);
          if (keep) {
            loadLyrics(selectedHymn);
          } else {
            const next = results[0] || null;
            setSelectedHymn(next);
            if (next) loadLyrics(next);
          }
        }
      } else {
        const filtered = sampleHymns.filter((h) => {
          const matchQ =
            !query ||
            String(h.hymn_number).includes(query) ||
            h.title.toLowerCase().includes(query.toLowerCase()) ||
            h.lyrics.toLowerCase().includes(query.toLowerCase());
          const matchCat = cat === "All" || h.category === cat;
          return matchQ && matchCat;
        });
        setHymnsList(filtered);
        const seedCache = {};
        filtered.forEach((h) => {
          seedCache[h.id] = h.lyrics;
        });
        setLyricsCache((prev) => ({ ...prev, ...seedCache }));
        setSelectedHymn((prev) =>
          prev && filtered.some((h) => h.id === prev.id)
            ? prev
            : filtered[0] || null,
        );
      }
    } catch (err) {
      console.error("Failed to fetch hymns:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedLyrics = selectedHymn ? lyricsCache[selectedHymn.id] || "" : "";

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-6">
      {/* Top Header Bar: Hymn Search & Categories */}
      <div className={`p-4 rounded-xl border space-y-3.5 ${cardClass}`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-3 border-border">
          <div>
            <h2
              className={`text-base font-bold flex items-center gap-2 ${headingClass}`}
            >
              <FaMusic set="bold" primaryColor="#D4A94A" size="14" />{" "}
              Hymn & Song Library
            </h2>
            <p className={`text-xs ${labelClass}`}>
              Search built-in and user-uploaded hymns by number or keywords.
            </p>
          </div>

          <div className="relative w-full sm:w-80">
            <div className="absolute left-3 top-2.5 pointer-events-none">
              <Search
                set="light"
                primaryColor={isLight ? "#6B7280" : "#696C75"}
                size="small"
              />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search hymn number (e.g. 120) or lyric keywords..."
              className={`w-full border rounded-lg pl-9 pr-3 py-2 text-xs outline-none transition ${
                isLight
                  ? "bg-[#F9FAFB] border-[#E5E7EB] text-[#111827] focus:border-accent"
                  : "bg-surface border-border text-text-primary focus:border-accent"
              }`}
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span
            className={`text-[11px] font-bold uppercase tracking-wider shrink-0 mr-1 ${labelClass}`}
          >
            Category:
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer shrink-0 ${
                selectedCategory === cat
                  ? "bg-accent text-bg shadow-sm font-bold"
                  : isLight
                    ? "bg-[#F3F4F6] text-[#4B5563] hover:bg-[#E5E7EB] hover:text-[#111827]"
                    : "bg-raised text-text-secondary hover:bg-[#25262B] hover:text-text-primary"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Layout: 2 Columns (Hymn List + Full Lyric Reader) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Hymn List (5 Columns) */}
        <div
          className={`lg:col-span-5 rounded-xl border p-4 flex flex-col justify-between max-h-155 ${cardClass}`}
        >
          <div className="space-y-3 flex-1 overflow-y-auto pr-1">
            <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider text-accent border-b pb-2 border-border">
              <span>Hymns Found ({hymnsList.length})</span>
              <span className={labelClass}>{selectedCategory}</span>
            </div>

            {hymnsList.length === 0 ? (
              <div
                className={`p-6 rounded-lg border text-center space-y-2 mt-4 ${innerCardClass}`}
              >
                <FaMusic
                  className={`text-xl mx-auto ${
                    isLight ? "text-[#9CA0AC]" : "text-[#696C75]"
                  }`}
                />
                <p className={`text-xs ${labelClass}`}>
                  No hymns match your query "{searchQuery}"
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {hymnsList.map((hymn) => {
                  const isSelected =
                    selectedHymn && selectedHymn.id === hymn.id;
                  return (
                    <div
                      key={hymn.id}
                      onClick={() => handleSelectHymn(hymn)}
                      className={`p-3 rounded-lg border transition cursor-pointer ${
                        isSelected
                          ? "bg-accent/15 border-accent text-text-primary"
                          : innerCardClass + " hover:border-[#383B44]"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-xs text-accent">
                          {hymnLabel(hymn)}
                        </span>
                        <span
                          className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                            isLight
                              ? "bg-[#E5E7EB] text-[#4B5563] border-[#D1D5DB]"
                              : "bg-raised text-text-secondary border-border"
                          }`}
                        >
                          {hymn.category || "Hymn"}
                        </span>
                      </div>
                      <h4
                        className={`text-xs font-bold truncate ${headingClass}`}
                      >
                        {hymn.title}
                      </h4>
                      <p
                        className={`text-[11px] line-clamp-1 mt-0.5 ${labelClass}`}
                      >
                        {hymn.excerpt || ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Lyric Reader & Live Presentation Controls (7 Columns) */}
        <div
          className={`lg:col-span-7 rounded-xl border p-5 flex flex-col justify-between max-h-155 ${cardClass}`}
        >
          {selectedHymn ? (
            <div className="space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b pb-3 border-border">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                      {selectedHymn.category || "General Hymn"}
                    </span>
                    <h3
                      className={`text-lg font-extrabold tracking-tight ${headingClass}`}
                    >
                      {selectedHymn.hymn_number > 0
                        ? `${hymnLabel(selectedHymn)} — `
                        : ""}
                      {selectedHymn.title}
                    </h3>
                  </div>
                  {selectedHymn.author && (
                    <span className={`text-xs italic ${labelClass}`}>
                      {selectedHymn.author}
                    </span>
                  )}
                </div>

                {/* Lyrics Reader Area */}
                <div
                  className={`p-5 rounded-xl border max-h-95 overflow-y-auto ${innerCardClass}`}
                >
                  {selectedLyrics ? (
                    <pre
                      className={`font-sans text-sm leading-relaxed whitespace-pre-wrap ${headingClass}`}
                    >
                      {selectedLyrics}
                    </pre>
                  ) : (
                    <p className={`text-xs ${labelClass} animate-pulse`}>
                      Loading lyrics…
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border">
                <button
                  onClick={() =>
                    handleStageNext &&
                    handleStageNext({
                      title: selectedHymn.title,
                      content: selectedLyrics || selectedHymn.lyrics || "",
                      type: "Hymn",
                      hymn_number: selectedHymn.hymn_number,
                      category: selectedHymn.category,
                    })
                  }
                  className={`py-2.5 px-3 border rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                    isLight
                      ? "bg-[#F3F4F6] hover:bg-[#E5E7EB] border-[#E5E7EB] text-[#111827]"
                      : "bg-raised hover:bg-hover border-border text-text-primary"
                  }`}
                >
                  <Show set="bold" primaryColor="#D4A94A" size="small" /> Stage
                  as Next
                </button>
                <button
                  onClick={() => {
                    if (!handleAddToPlaylist || !selectedHymn) return;
                    const lyrics = selectedLyrics || selectedHymn.lyrics || "";
                    handleAddToPlaylist({
                      title: selectedHymn.title,
                      content: lyrics,
                      lyrics: lyrics,
                      type: "Hymn",
                      hymn_number: selectedHymn.hymn_number,
                      category: selectedHymn.category,
                    });
                  }}
                  className={`py-2.5 px-3 border rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                    isLight
                      ? "bg-[#F3F4F6] hover:bg-[#E5E7EB] border-[#E5E7EB] text-[#111827]"
                      : "bg-raised hover:bg-hover border-border text-text-primary"
                  }`}
                >
                  <FaPlus set="bold" primaryColor="#6FCF97" size="14" /> Add to
                  Playlist
                </button>
                <button
                  onClick={() =>
                    handlePresentNow &&
                    handlePresentNow({
                      title: selectedHymn.title,
                      content: selectedLyrics || selectedHymn.lyrics || "",
                      type: "Hymn",
                      hymn_number: selectedHymn.hymn_number,
                      category: selectedHymn.category,
                    })
                  }
                  className="py-2.5 px-3 bg-accent hover:bg-accent-hover text-bg rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow transition cursor-pointer"
                >
                  <Send set="bold" primaryColor="#0B0C0E" size="small" />{" "}
                  Present Live
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-2">
              <FaMusic
                className={`text-4xl mx-auto mb-1 ${
                  isLight ? "text-[#9CA0AC]" : "text-[#696C75]"
                }`}
              />
              <p className={`text-sm font-bold ${headingClass}`}>
                Select a Hymn to View Lyrics
              </p>
              <p className={`text-xs ${labelClass}`}>
                Choose any hymn or song from the list on the left to read full
                stanzas.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
