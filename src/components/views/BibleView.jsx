import React, { useState } from "react";
import { Search, Show, Plus, Send, Category, Document } from "react-iconly";
import {
  getBibleBookLists,
  normalizeBookName,
  isTwiCode,
} from "../../bibleBooks.js";
import { FaPlus } from "react-icons/fa6";
export default function BibleView({
  biblesList,
  allBooksList,
  selectedTranslation,
  setSelectedTranslation,
  selectedBook,
  setSelectedBook,
  selectedChapter,
  setSelectedChapter,
  searchQuery,
  setSearchQuery,
  selectedVerseIndex,
  setSelectedVerseIndex,
  searchInputRef,
  filteredVerses,
  activeSelectedVerse,
  handleStageNext,
  handlePresentNow,
  handleAddToPlaylist,
  themeMode,
  secondaryTranslation,
  setSecondaryTranslation,
  secondaryVerses,
}) {
  const isLight = themeMode === "light";
  const isTwi = isTwiCode(selectedTranslation);
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'reader'

  const rawCodes =
    biblesList && biblesList.length > 0
      ? biblesList.map((b) => b.code)
      : ["NIV", "NKJV", "KJV", "TWI"];

  const translations = Array.from(new Set(rawCodes));

  // Fetch secondary parallel translation verses when selection changes
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

  // Use the live SQLite book list when available, otherwise fall back to the
  // canonical per-translation preset list so both English & Twi always render.
  const presetLists = getBibleBookLists(selectedTranslation);
  const dbLists = {
    ot:
      allBooksList && allBooksList.length > 0
        ? allBooksList.filter((b) => (b.book_number || 0) <= 39)
        : [],
    nt:
      allBooksList && allBooksList.length > 0
        ? allBooksList.filter((b) => (b.book_number || 0) > 39)
        : [],
  };

  const otBooks = dbLists.ot.length > 0 ? dbLists.ot : presetLists.ot;
  const ntBooks = dbLists.nt.length > 0 ? dbLists.nt : presetLists.nt;

  const otHeading = isTwi ? "Apam Dedaw — Old Testament" : "Old Testament";
  const ntHeading = isTwi ? "Apam Foforo — New Testament" : "New Testament";

  // Highlight the search terms inside verse text (case-insensitive, safe regex)
  const highlightText = (text, query) => {
    const q = String(query || "").trim();
    if (!q || !text) return text;
    const tokens = q
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (tokens.length === 0) return text;
    const lowerParts = new Set(tokens.map((t) => t.toLowerCase()));
    return String(text)
      .split(new RegExp(`(${tokens.join("|")})`, "ig"))
      .map((part, idx) =>
        lowerParts.has(part.toLowerCase()) ? (
          <span
            key={idx}
            className="bg-accent/25 text-accent font-semibold rounded-sm px-0.5"
          >
            {part}
          </span>
        ) : (
          part
        ),
      );
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Top Header Bar: Translations & View Mode Toggle */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg border transition-colors duration-200 ${
          isLight
            ? "bg-[#FFFFFF] border-[#E5E7EB]"
            : "bg-[#151619] border-[#2A2C31]"
        }`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${isLight ? "text-[#6B7280]" : "text-[#6B6C73]"}`}
            >
              Primary:
            </span>
            <div
              className={`flex items-center gap-1 p-1 rounded border ${
                isLight
                  ? "bg-[#F3F4F6] border-[#E5E7EB]"
                  : "bg-[#1C1D21] border-[#2A2C31]"
              }`}
            >
              {translations.map((tr) => (
                <button
                  key={tr}
                  onClick={() => {
                    setSelectedTranslation(tr);
                    setSelectedVerseIndex(0);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                    selectedTranslation === tr
                      ? "bg-accent text-bg shadow"
                      : isLight
                        ? "text-[#4B5563] hover:text-[#111827]"
                        : "text-[#9B9CA3] hover:text-text-primary"
                  }`}
                >
                  {tr}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${isLight ? "text-[#6B7280]" : "text-[#6B6C73]"}`}
            >
              Parallel:
            </span>
            <div
              className={`flex items-center gap-1 p-1 rounded border ${
                isLight
                  ? "bg-[#F3F4F6] border-[#E5E7EB]"
                  : "bg-[#1C1D21] border-[#2A2C31]"
              }`}
            >
              {["None", ...translations.filter((tr) => tr !== selectedTranslation)].map((tr) => (
                <button
                  key={tr}
                  onClick={() => setSecondaryTranslation(tr)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                    secondaryTranslation === tr
                      ? "bg-amber-500/20 text-accent border border-amber-500/40 font-bold"
                      : isLight
                        ? "text-[#4B5563] hover:text-[#111827]"
                        : "text-[#9B9CA3] hover:text-text-primary"
                  }`}
                >
                  {tr}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div
          className={`flex items-center gap-1 p-1 rounded border ${
            isLight
              ? "bg-[#F3F4F6] border-[#E5E7EB]"
              : "bg-[#1C1D21] border-[#2A2C31]"
          }`}
        >
          <button
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
              viewMode === "grid"
                ? "bg-accent text-bg shadow"
                : isLight
                  ? "text-[#4B5563] hover:text-[#111827]"
                  : "text-[#9B9CA3] hover:text-text-primary"
            }`}
          >
            <Category set="bold" primaryColor="currentColor" size="small" /> OT
            / NT Chapter Grid
          </button>
          <button
            onClick={() => setViewMode("reader")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
              viewMode === "reader"
                ? "bg-accent text-bg shadow"
                : isLight
                  ? "text-[#4B5563] hover:text-[#111827]"
                  : "text-[#9B9CA3] hover:text-text-primary"
            }`}
          >
            <Document set="bold" primaryColor="currentColor" size="small" />{" "}
            Verses & Live Controls
          </button>
        </div>
      </div>

      {/* Scripture Search Bar */}
      <div className="relative flex items-center">
        <div className="absolute left-3 pointer-events-none">
          <Search
            set="light"
            primaryColor={isLight ? "#6B7280" : "#6B6C73"}
            size="small"
          />
        </div>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search scripture reference or keyword (e.g. John 3:16, light, shepherd, Nyankopɔn)..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedVerseIndex(0);
            if (e.target.value.trim() && viewMode !== "reader") {
              setViewMode("reader");
            }
          }}
          className={`w-full border focus:border-accent rounded-lg pl-9 pr-4 py-2.5 text-xs outline-none transition ${
            isLight
              ? "bg-[#FFFFFF] border-[#E5E7EB] text-[#111827] placeholder-[#9CA3AF]"
              : "bg-[#151619] border-[#2A2C31] text-text-primary placeholder-[#6B6C73]"
          }`}
        />
      </div>

      {/* active selection indicator bar */}
      <div
        className={`flex items-center justify-between px-4 py-2 rounded-lg border text-xs font-medium ${
          isLight
            ? "bg-[#FFFFFF] border-[#E5E7EB]"
            : "bg-[#151619] border-[#2A2C31]"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-accent font-bold">Selected Passage:</span>
          <span className={isLight ? "text-[#111827]" : "text-text-primary"}>
            {selectedBook} Chapter {selectedChapter} ({selectedTranslation})
          </span>
        </div>
        <button
          onClick={() => setViewMode(viewMode === "grid" ? "reader" : "grid")}
          className="text-accent hover:underline font-semibold"
        >
          {viewMode === "grid" ? "Open Verse Reader ➔" : "Back to OT/NT Grid ➔"}
        </button>
      </div>

      {/* 1. GRID VIEW: 2-COLUMN OLD TESTAMENT & NEW TESTAMENT (matching image.png) */}
      {viewMode === "grid" && (
        <div
          className={`p-6 rounded-lg border transition-colors duration-200 ${
            isLight
              ? "bg-[#FFFFFF] border-[#E5E7EB]"
              : "bg-[#151619] border-[#2A2C31]"
          }`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Left Column: Old Testament */}
            <div className="space-y-6">
              <h2
                className={`text-2xl font-black tracking-tight border-b pb-2 ${
                  isLight
                    ? "text-[#111827] border-[#E5E7EB]"
                    : "text-text-primary border-[#2A2C31]"
                }`}
              >
                {otHeading}
              </h2>

              <div className="space-y-5">
                {otBooks.map((b) => (
                  <div key={b.name} className="space-y-2">
                    <h3
                      className={`text-sm font-bold ${isLight ? "text-[#111827]" : "text-text-primary"}`}
                    >
                      {b.name}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(
                        { length: b.chaptersCount || 1 },
                        (_, i) => i + 1,
                      ).map((ch) => {
                        const isSelected =
                          normalizeBookName(selectedBook) ===
                            normalizeBookName(b.name) && selectedChapter === ch;
                        return (
                          <button
                            key={ch}
                            onClick={() => {
                              setSelectedBook(b.name);
                              setSelectedChapter(ch);
                              setSelectedVerseIndex(0);
                              setSearchQuery("");
                              setViewMode("reader");
                            }}
                            className={`min-w-8 h-8 px-2 rounded text-xs font-bold flex items-center justify-center transition cursor-pointer ${
                              isSelected
                                ? "bg-accent text-bg shadow-md ring-2 ring-accent/50"
                                : isLight
                                  ? "bg-[#E5E7EB] text-[#111827] hover:bg-accent hover:text-bg"
                                  : "bg-[#24262B] text-text-primary hover:bg-accent hover:text-bg"
                            }`}
                          >
                            {ch}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: New Testament */}
            <div className="space-y-6">
              <h2
                className={`text-2xl font-black tracking-tight border-b pb-2 ${
                  isLight
                    ? "text-[#111827] border-[#E5E7EB]"
                    : "text-text-primary border-[#2A2C31]"
                }`}
              >
                {ntHeading}
              </h2>

              <div className="space-y-5">
                {ntBooks.map((b) => (
                  <div key={b.name} className="space-y-2">
                    <h3
                      className={`text-sm font-bold ${isLight ? "text-[#111827]" : "text-text-primary"}`}
                    >
                      {b.name}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(
                        { length: b.chaptersCount || 1 },
                        (_, i) => i + 1,
                      ).map((ch) => {
                        const isSelected =
                          normalizeBookName(selectedBook) ===
                            normalizeBookName(b.name) && selectedChapter === ch;
                        return (
                          <button
                            key={ch}
                            onClick={() => {
                              setSelectedBook(b.name);
                              setSelectedChapter(ch);
                              setSelectedVerseIndex(0);
                              setSearchQuery("");
                              setViewMode("reader");
                            }}
                            className={`min-w-8 h-8 px-2 rounded text-xs font-bold flex items-center justify-center transition cursor-pointer ${
                              isSelected
                                ? "bg-accent text-bg shadow-md ring-2 ring-accent/50"
                                : isLight
                                  ? "bg-[#E5E7EB] text-[#111827] hover:bg-accent hover:text-bg"
                                  : "bg-[#24262B] text-text-primary hover:bg-accent hover:text-bg"
                            }`}
                          >
                            {ch}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. READER VIEW: VERSES GRID & LIVE PROJECTION CONTROLS */}
      {viewMode === "reader" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div
            className={`lg:col-span-7 border rounded-lg p-3 space-y-2 max-h-125 overflow-y-auto ${
              isLight
                ? "bg-[#FFFFFF] border-[#E5E7EB]"
                : "bg-[#151619] border-[#2A2C31]"
            }`}
          >
            <div
              className={`px-2 py-1.5 text-[10px] uppercase font-bold tracking-wider border-b flex justify-between items-center ${
                isLight
                  ? "text-[#6B7280] border-[#E5E7EB]"
                  : "text-[#6B6C73] border-[#2A2C31]"
              }`}
            >
              <span>
                Verses ({filteredVerses.length}) — Use ↑ ↓ keys to navigate
              </span>
              <span className="font-mono text-accent">
                {selectedBook} Ch {selectedChapter}
              </span>
            </div>

            {filteredVerses.map((v, index) => {
              const isSelected = selectedVerseIndex === index;
              return (
                <div
                  key={v.id || index}
                  onClick={() => setSelectedVerseIndex(index)}
                  className={`p-3 rounded-lg border transition cursor-pointer ${
                    isSelected
                      ? isLight
                        ? "bg-[#E5E7EB] border-accent/70 text-[#111827] shadow"
                        : "bg-[#24262B] border-accent/60 text-text-primary shadow"
                      : isLight
                        ? "bg-[#F9FAFB] border-[#E5E7EB] text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#111827]"
                        : "bg-[#1C1D21] border-[#2A2C31] text-[#9B9CA3] hover:bg-[#24262B]/60 hover:text-text-primary"
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-xs text-accent">
                      {v.ref}
                    </span>
                    <span
                      className={`text-[10px] font-mono ${isLight ? "text-[#9CA3AF]" : "text-[#6B6C73]"}`}
                    >
                      {selectedTranslation}
                    </span>
                  </div>
                  <p
                    className={`text-xs leading-relaxed ${
                      isSelected
                        ? isLight
                          ? "text-[#111827]"
                          : "text-text-primary"
                        : isLight
                          ? "text-[#4B5563]"
                          : "text-[#9B9CA3]"
                    }`}
                  >
                    {highlightText(v.text, searchQuery)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Selected Scripture Details & Action Controls */}
          <div
            className={`lg:col-span-5 border rounded-lg p-5 flex flex-col justify-between ${
              isLight
                ? "bg-[#FFFFFF] border-[#E5E7EB]"
                : "bg-[#151619] border-[#2A2C31]"
            }`}
          >
            <div className="space-y-4">
              <div
                className={`border-b pb-2 flex justify-between items-center ${isLight ? "border-[#E5E7EB]" : "border-[#2A2C31]"}`}
              >
                <span className="text-[10px] uppercase font-bold tracking-wider text-accent">
                  Selected Scripture Reading
                </span>
                <span
                  className={`text-[10px] font-mono ${isLight ? "text-[#9CA3AF]" : "text-[#6B6C73]"}`}
                >
                  {selectedTranslation}
                </span>
              </div>

              {activeSelectedVerse && (
                <div className="space-y-3">
                  <h3
                    className={`text-base font-bold ${isLight ? "text-[#111827]" : "text-text-primary"}`}
                  >
                    {activeSelectedVerse.ref}
                  </h3>
                  <div
                    className={`text-xs p-4 rounded-lg border leading-relaxed space-y-2.5 ${
                      isLight
                        ? "bg-[#F3F4F6] border-[#E5E7EB] text-[#111827]"
                        : "bg-[#1C1D21] border-[#2A2C31] text-text-primary"
                    }`}
                  >
                    <div>{highlightText(activeSelectedVerse.text, searchQuery)}</div>
                    {secondaryTranslation !== "None" && (() => {
                      const secMatch = secondaryVerses.find((v) => v.verse === activeSelectedVerse.verse);
                      if (secMatch && secMatch.text) {
                        return (
                          <div className="pt-2 border-t border-accent/30 text-accent font-medium italic">
                            <span className="text-[10px] font-mono uppercase font-bold not-italic mr-1.5 opacity-80">
                              [{secondaryTranslation}]
                            </span>
                            {highlightText(secMatch.text, searchQuery)}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              )}
            </div>

            <div
              className={`space-y-2.5 pt-5 border-t ${isLight ? "border-[#E5E7EB]" : "border-[#2A2C31]"}`}
            >
              <button
                onClick={() => handleStageNext(getVerseWithSecondary(activeSelectedVerse))}
                className={`w-full py-2.5 px-3 border hover:border-accent/50 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                  isLight
                    ? "bg-[#F3F4F6] hover:bg-[#E5E7EB] border-[#E5E7EB] text-[#111827]"
                    : "bg-[#1C1D21] hover:bg-[#24262B] border-[#2A2C31] text-text-primary"
                }`}
              >
                <Show set="bold" primaryColor="#D4A94A" size="small" /> Stage as
                Next
              </button>
              <button
                onClick={() => {
                  if (!handleAddToPlaylist || !activeSelectedVerse) return;
                  const withSec = getVerseWithSecondary(activeSelectedVerse);
                  handleAddToPlaylist({
                    ...withSec,
                    book: activeSelectedVerse.book || selectedBook,
                    chapter: activeSelectedVerse.chapter || selectedChapter,
                    verse: activeSelectedVerse.verse,
                    translation: selectedTranslation,
                    ref: activeSelectedVerse.ref || `${selectedBook} ${selectedChapter}:${activeSelectedVerse.verse}`,
                  });
                }}
                className={`w-full py-2.5 px-3 border hover:border-accent/50 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                  isLight
                    ? "bg-[#F3F4F6] hover:bg-[#E5E7EB] border-[#E5E7EB] text-[#111827]"
                    : "bg-[#1C1D21] hover:bg-[#24262B] border-[#2A2C31] text-text-primary"
                }`}
              >
                <FaPlus set="bold" primaryColor="#6FCF97" size="14" /> Add to
                Service Playlist
              </button>
              <button
                onClick={() => handlePresentNow(getVerseWithSecondary(activeSelectedVerse))}
                className="w-full py-3 px-3 bg-accent hover:bg-accent/90 text-bg rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
              >
                <Send set="bold" primaryColor="#0B0C0E" size="small" /> Present
                Live Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
