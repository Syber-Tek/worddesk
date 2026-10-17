import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { extractYouTubeId } from "../components/MediaSlide";

/**
 * The presentation engine: everything that decides what is on the projector.
 *
 * This is deliberately the only place that builds a live-slide payload. A media
 * slide once worked in the planner but rendered as a filename on the projector,
 * because the individual present paths each rebuilt the payload by hand and
 * quietly dropped the media fields. One owner, one payload shape, one place to
 * look â€” see mediaOverrides below for the fields that must never be trimmed.
 *
 * State it owns (currentSlide, nextSlide, isLive, isBlack, isBlank, hymnDeck,
 * hymnDeckIndex) is returned so App can wire it into the rail and planner.
 */
export default function usePresentationOutput({
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
}) {
  const [currentSlide, setCurrentSlide] = useState(null);
  const [nextSlide, setNextSlide] = useState({});
  const [isLive, setIsLive] = useState(false);
  const [isBlack, setIsBlack] = useState(false);
  const [isBlank, setIsBlank] = useState(false);
  const [hymnDeck, setHymnDeck] = useState([]);
  const [hymnDeckIndex, setHymnDeckIndex] = useState(0);

  // A multi-page PDF is a deck of its own, stepped with the same Next/Prev the
  // operator already uses for verses and stanzas. mediaPage is the zero-based
  // page on air; pageCount is reported back from the window that loaded the PDF.
  // A hymn deck wins if one is active, because that is already the thing being
  // stepped through.
  const [mediaPage, setMediaPage] = useState(0);
  const [mediaPageCount, setMediaPageCount] = useState(0);

  // Bumped to restart the clip on air. The output window uses this as the
  // <video> React key, so changing it remounts the element and playback begins
  // again from zero. Cheaper than shipping play/pause/seek over IPC.
  const [mediaReplay, setMediaReplay] = useState(0);

  const handleReplayVideo = () => {
    setMediaReplay((n) => n + 1);
  };

  const isPagingPdf =
    currentSlide?.mediaType === "pdf" &&
    !(hymnDeck.length > 1 && currentSlide?.type === "Hymn");

  // Every field below must survive every trip through the payload. The media
  // fields are the fragile ones: drop them and the output window falls through
  // to the text renderer, which draws the slide title as a bottom attribution
  // line, so a photo silently becomes a filename.
  const mediaOverrides = (slide) => {
    const isYouTube =
      slide?.mediaType === "youtube" ||
      slide?.type === "YouTube Video" ||
      !!slide?.youtubeId;
    return {
      mediaType: isYouTube ? "youtube" : slide?.mediaType || null,
      mediaName: slide?.mediaName || null,
      mediaUrl: slide?.mediaUrl || null,
      youtubeId:
        slide?.youtubeId ||
        (isYouTube ? extractYouTubeId(slide?.mediaUrl || slide?.content) : null),
      mediaFit: slide?.mediaFit || "contain",
      mediaMuted:
        slide?.mediaMuted === true
          ? true
          : isYouTube
            ? false
            : slide?.mediaMuted !== false,
    };
  };

  const parseVerseRef = (refOrTitle) => {
    if (!refOrTitle || typeof refOrTitle !== "string") return null;
    const m = String(refOrTitle).match(
      /^([1-3]?\s*[A-Za-z]+(?:\s+[A-Za-z]+)*?)\s+(\d+)[:.](\d+)/i,
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

  const normalizeSlide = (item) => {
    if (!item || typeof item !== "object") return null;
    const parsedRef = parseVerseRef(item.ref || item.title);
    const isVerse = !!(
      item.ref ||
      item.book ||
      item.type === "Bible Verse" ||
      parsedRef
    );
    const refTitle = item.ref ? item.ref : "";
    const title = item.title || refTitle || "Untitled Slide";
    const content =
      item.content || item.text || item.lyrics || item.verse_text || "";
    const type = item.type || (isVerse ? "Bible Verse" : "Custom Slide");
    return {
      title,
      content,
      secondaryText: item.secondaryText || "",
      secondaryTranslation: item.secondaryTranslation || "",
      type,
      book: item.book || parsedRef?.book || null,
      chapter:
        item.chapter != null ? Number(item.chapter) : parsedRef?.chapter || null,
      verse:
        item.verse != null ? Number(item.verse) : parsedRef?.verse || null,
      ref: item.ref || (parsedRef ? `${parsedRef.book} ${parsedRef.chapter}:${parsedRef.verse}` : refTitle),
      translation: item.translation || null,
      lyrics: item.lyrics || (type === "Hymn" ? content : null),
      hymn_number: item.hymn_number,
      category: item.category,
      mediaType: item.mediaType || null,
      mediaName: item.mediaName || null,
      mediaUrl: item.mediaUrl || null,
      youtubeId: item.youtubeId || null,
      mediaFit: item.mediaFit || "contain",
      mediaMuted: item.mediaMuted !== false,
    };
  };

  const broadcastToPresentation = useCallback(
    (overrides = {}) => {
      if (window.api && window.api.sendLiveSlide) {
        const isVerseDeck =
          (currentSlide?.type || "Bible Verse") === "Bible Verse";
        const isHymnDeckActive = !isVerseDeck && hymnDeck.length > 1;

        let nextSlideTitle = "";
        let nextSlideContent = "";

        if (isVerseDeck && Array.isArray(filteredVerses)) {
          const nextVerse = filteredVerses[selectedVerseIndex + 1];
          if (nextVerse) {
            nextSlideTitle = nextVerse.ref || `Verse ${selectedVerseIndex + 2}`;
            nextSlideContent = nextVerse.text || "";
          }
        } else if (isHymnDeckActive && Array.isArray(hymnDeck)) {
          const nextHymnSlide = hymnDeck[hymnDeckIndex + 1];
          if (nextHymnSlide) {
            nextSlideTitle = nextHymnSlide.hymnLabel
              ? `${nextHymnSlide.hymnLabel} — ${nextHymnSlide.title}`
              : nextHymnSlide.title;
            nextSlideContent = nextHymnSlide.content || "";
          }
        } else if (nextSlide && (nextSlide.title || nextSlide.content)) {
          nextSlideTitle = nextSlide.title || nextSlide.ref || "";
          nextSlideContent = nextSlide.content || nextSlide.text || "";
        }

        // A media slide's title IS its filename. Showing it puts a file name in
        // the header and the bottom attribution bar, which is never what an
        // operator wants on air, so media slides send no title at all.
        const isMediaSlide = !!(
          currentSlide?.mediaName ||
          currentSlide?.mediaUrl ||
          currentSlide?.mediaType === "youtube" ||
          currentSlide?.type === "YouTube Video" ||
          currentSlide?.type === "Online Image"
        );

        window.api.sendLiveSlide({
          title: isMediaSlide
            ? ""
            : currentSlide?.title || currentSlide?.ref || "",
          content: currentSlide?.content || currentSlide?.text || "",
          secondaryText: currentSlide?.secondaryText || "",
          secondaryTranslation: currentSlide?.secondaryTranslation || "",
          type: currentSlide?.type || "Bible Verse",
          hymnLabel: currentSlide?.hymnLabel || "",
          nextSlideTitle,
          nextSlideContent,
          isLive,
          isBlank,
          isBlack,
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
          // mediaName is a stored filename, not a path. The output window
          // resolves it to a file:// URL via IPC so path logic stays in main.
          ...mediaOverrides(currentSlide),
          mediaPage,
          mediaReplay,
          deckPosition: isVerseDeck
            ? Math.min(selectedVerseIndex + 1, filteredVerses.length)
            : isHymnDeckActive
              ? hymnDeckIndex + 1
              : 0,
          deckTotal: isVerseDeck
            ? filteredVerses.length
            : isHymnDeckActive
              ? hymnDeck.length
              : 0,
          ...overrides,
        });
      }
    },
    [
      currentSlide,
      isLive,
      isBlank,
      isBlack,
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
      selectedVerseIndex,
      filteredVerses.length,
      hymnDeck,
      hymnDeckIndex,
      mediaPage,
      mediaReplay,
    ],
  );

  // Re-broadcast on every change so the projector always mirrors app state,
  // including after a transport action that mutates state without an explicit
  // payload of its own.
  useEffect(() => {
    broadcastToPresentation();
  }, [broadcastToPresentation]);

  const markStatus = (id, status) => {
    setPlaylist((prev) =>
      prev.map((i) => {
        if (i.id === id) return { ...i, status };
        if (i.status === status) return { ...i, status: "pending" };
        return i;
      }),
    );
  };

  // Stage an item as "Next" without going on air. The media fields must be
  // carried here too, otherwise the rail's Next Staged preview has nothing to
  // show and silently renders no thumbnail at all.
  const handleSelectItem = async (item) => {
    const isHymn = !!item && item.type === "Hymn";
    const isVerse =
      !!item &&
      (item.type === "Bible Verse" || !!item.ref || !!item.book || !!item.verse);

    if (isHymn) {
      const slides = buildHymnDeck(item);
      setHymnDeck(slides);
      setHymnDeckIndex(0);
      const stageSlide = slides[0] || item;
      setNextSlide(stageSlide);
      markStatus(item.id, "next");
      toast.info(`Staged "${stageSlide.title || "hymn"}" as Next`);
      return;
    }

    if (isVerse && syncVerseContext) {
      const ctx = await syncVerseContext(item);
      const verses = ctx?.verses;
      const vIndex = ctx?.index != null ? ctx.index : 0;
      const stagedVerse = verses && verses[vIndex] ? getVerseWithSecondary(verses[vIndex]) : item;
      const stagedSlide = {
        id: item.id || `verse-${stagedVerse.id || Date.now()}`,
        title: stagedVerse.ref || item.title || "",
        content: item.content || stagedVerse.text || stagedVerse.content || "",
        secondaryText: stagedVerse.secondaryText || "",
        secondaryTranslation: stagedVerse.secondaryTranslation || "",
        type: "Bible Verse",
        book: stagedVerse.book || item.book,
        chapter: stagedVerse.chapter != null ? stagedVerse.chapter : item.chapter,
        verse: stagedVerse.verse != null ? stagedVerse.verse : item.verse,
        ...mediaOverrides(item),
      };
      setNextSlide(stagedSlide);
      markStatus(item.id, "next");
      toast.info(`Staged "${stagedSlide.title || "verse"}" as Next`);
      return;
    }

    setNextSlide({
      id: item.id,
      title: item.title,
      content: item.content,
      secondaryText: item.secondaryText || "",
      secondaryTranslation: item.secondaryTranslation || "",
      type: item.type,
      ...mediaOverrides(item),
    });
    markStatus(item.id, "next");
    toast.info(`Staged "${item.title || "item"}" as Next`);
  };

  const handleStageNext = (item) => {
    const slide = normalizeSlide(item);
    if (!slide) return;
    if (slide.type === "Hymn") {
      const slides = buildHymnDeck(slide);
      setHymnDeck(slides);
      setHymnDeckIndex(0);
      setNextSlide(slides[0] || slide);
    } else {
      setNextSlide({ id: `item-${Date.now()}`, ...slide });
    }
    toast.info(`Staged "${slide.title || "item"}" as Next`);
  };

  const handlePresentItemNow = async (item) => {
    const isHymn = !!item && item.type === "Hymn";
    const isVerse =
      !!item &&
      (item.type === "Bible Verse" || !!item.ref || !!item.book || !!item.verse);

    if (isHymn) {
      const slides = buildHymnDeck(item);
      setHymnDeck(slides);
      setHymnDeckIndex(0);
      const liveSlide = slides[0] || item;
      const nextSlideObj = slides.length > 1 ? slides[1] : {};

      setCurrentSlide(liveSlide);
      setNextSlide(nextSlideObj);
      setMediaPage(0);
      setIsLive(true);
      setIsBlack(false);
      setIsBlank(false);

      broadcastToPresentation({
        title: liveSlide.title,
        content: liveSlide.content,
        type: liveSlide.type,
        hymnLabel: liveSlide.hymnLabel || "",
        nextSlideTitle: slides[1]
          ? (slides[1].hymnLabel ? `${slides[1].hymnLabel} — ${slides[1].title}` : slides[1].title)
          : "",
        nextSlideContent: slides[1]?.content || "",
        isLive: true,
        isBlack: false,
        isBlank: false,
        ...mediaOverrides(item),
      });

      markStatus(item.id, "live");
      toast.success(`Broadcasting "${liveSlide.title || "slide"}" Live`);
      return;
    }

    if (isVerse && syncVerseContext) {
      setHymnDeck([]);
      setHymnDeckIndex(0);
      const ctx = await syncVerseContext(item);
      const verses = ctx?.verses;
      const vIndex = ctx?.index != null ? ctx.index : 0;

      if (setSelectedVerseIndex && ctx?.index != null) {
        setSelectedVerseIndex(ctx.index);
      }

      const liveVerse = verses && verses[vIndex] ? getVerseWithSecondary(verses[vIndex]) : item;
      const nextVerse = verses && verses[vIndex + 1] ? getVerseWithSecondary(verses[vIndex + 1]) : null;

      // If this item was loaded from a plan with saved text, that saved text must be honored!
      const contentToUse = item.content || liveVerse.text || liveVerse.content || "";

      const liveSlide = {
        id: item.id || `verse-${liveVerse.id || Date.now()}`,
        title: liveVerse.ref || item.title || "",
        content: contentToUse,
        secondaryText: liveVerse.secondaryText || "",
        secondaryTranslation: liveVerse.secondaryTranslation || "",
        type: "Bible Verse",
        book: liveVerse.book || item.book,
        chapter: liveVerse.chapter != null ? liveVerse.chapter : item.chapter,
        verse: liveVerse.verse != null ? liveVerse.verse : item.verse,
        ...mediaOverrides(item),
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

      setCurrentSlide(liveSlide);
      setNextSlide(nextSlideObj);
      setMediaPage(0);
      setIsLive(true);
      setIsBlack(false);
      setIsBlank(false);

      broadcastToPresentation({
        title: liveSlide.title,
        content: liveSlide.content,
        secondaryText: liveSlide.secondaryText,
        secondaryTranslation: liveSlide.secondaryTranslation,
        type: "Bible Verse",
        nextSlideTitle: nextVerse?.ref || "",
        nextSlideContent: nextVerse?.text || "",
        isLive: true,
        isBlack: false,
        isBlank: false,
        ...mediaOverrides(item),
      });

      markStatus(item.id, "live");
      toast.success(`Broadcasting "${liveSlide.title || "verse"}" Live`);
      return;
    }

    setHymnDeck([]);
    setHymnDeckIndex(0);
    const updatedSlide = {
      id: item.id,
      title: item.title,
      content: item.content,
      type: item.type,
      ...mediaOverrides(item),
    };
    setCurrentSlide(updatedSlide);
    setNextSlide({});
    setMediaPage(0);
    setIsLive(true);
    setIsBlack(false);
    setIsBlank(false);

    broadcastToPresentation({
      title: updatedSlide.title,
      content: updatedSlide.content,
      type: updatedSlide.type,
      isLive: true,
      isBlack: false,
      isBlank: false,
      ...mediaOverrides(item),
    });

    markStatus(item.id, "live");
    toast.success(`Broadcasting "${updatedSlide.title || "slide"}" Live`);
  };

  const handlePresentNow = (item) => {
    const isVerse = !!(item && (item.ref || item.book || item.type === "Bible Verse"));
    const isHymn = !!item && item.type === "Hymn";
    let updated;
    let nextUp = {};

    if (isHymn) {
      const slides = buildHymnDeck(item);
      setHymnDeck(slides);
      setHymnDeckIndex(0);
      updated = slides[0] || item;
      nextUp = slides.length > 1 ? slides[1] : {};
    } else {
      setHymnDeck([]);
      setHymnDeckIndex(0);
      updated = {
        id: item.id ? `verse-${item.id}` : `present-${Date.now()}`,
        title: item.ref ? item.ref : item.title || "",
        content: item.content || item.text || "",
        secondaryText: item.secondaryText || "",
        secondaryTranslation: item.secondaryTranslation || "",
        type: item.type || "Bible Verse",
        ...mediaOverrides(item),
      };
      if (isVerse && Array.isArray(filteredVerses)) {
        const nextV = filteredVerses[selectedVerseIndex + 1];
        if (nextV) {
          const secNext = getVerseWithSecondary(nextV);
          nextUp = {
            id: `verse-${secNext.id}`,
            title: secNext.ref || "",
            content: secNext.text || "",
            secondaryText: secNext.secondaryText || "",
            secondaryTranslation: secNext.secondaryTranslation || "",
            type: "Bible Verse",
          };
        }
      }
    }
    setCurrentSlide(updated);
    setNextSlide(nextUp);
    setMediaPage(0);
    setIsLive(true);
    setIsBlack(false);
    setIsBlank(false);

    broadcastToPresentation({
      title: updated.title,
      content: updated.content,
      secondaryText: updated.secondaryText,
      secondaryTranslation: updated.secondaryTranslation,
      type: updated.type,
      hymnLabel: updated.hymnLabel || "",
      nextSlideTitle: nextUp.title || (nextUp.hymnLabel ? `${nextUp.hymnLabel} — ${nextUp.title}` : "") || "",
      nextSlideContent: nextUp.content || nextUp.text || "",
      isLive: true,
      isBlack: false,
      isBlank: false,
      ...mediaOverrides(item),
    });
  };

  const handleTransportPresent = () => {
    const hasNext =
      nextSlide &&
      (nextSlide.title ||
        nextSlide.content ||
        nextSlide.mediaName ||
        nextSlide.mediaUrl ||
        nextSlide.youtubeId);
    if (hasNext) {
      let toPresent = nextSlide;
      let nextUp = {};

      if (
        nextSlide.type === "Hymn" ||
        (hymnDeck.length > 0 && nextSlide.hymnLabel)
      ) {
        const slides =
          hymnDeck.length > 0 ? hymnDeck : buildHymnDeck(nextSlide);
        if (hymnDeck.length === 0) setHymnDeck(slides);
        setHymnDeckIndex(0);
        toPresent = slides[0] || nextSlide;
        nextUp = slides.length > 1 ? slides[1] : {};
      } else if (
        nextSlide.type === "Bible Verse" &&
        Array.isArray(filteredVerses)
      ) {
        toPresent = nextSlide;
        let vIdx = selectedVerseIndex;
        if (nextSlide.verse != null) {
          const match = filteredVerses.findIndex(
            (v) => Number(v.verse) === Number(nextSlide.verse)
          );
          if (match >= 0) {
            vIdx = match;
            if (setSelectedVerseIndex) setSelectedVerseIndex(vIdx);
          }
        }
        const nextV = filteredVerses[vIdx + 1];
        if (nextV) {
          const secNext = getVerseWithSecondary(nextV);
          nextUp = {
            id: `verse-${secNext.id}`,
            title: secNext.ref || "",
            content: secNext.text || "",
            secondaryText: secNext.secondaryText || "",
            secondaryTranslation: secNext.secondaryTranslation || "",
            type: "Bible Verse",
            book: secNext.book,
            chapter: secNext.chapter,
            verse: secNext.verse,
          };
        }
      }

      setCurrentSlide(toPresent);
      setNextSlide(nextUp);
      setMediaPage(0);
      setIsLive(true);
      setIsBlack(false);
      setIsBlank(false);

      broadcastToPresentation({
        title: toPresent.title,
        content: toPresent.content,
        secondaryText: toPresent.secondaryText || "",
        secondaryTranslation: toPresent.secondaryTranslation || "",
        type: toPresent.type,
        hymnLabel: toPresent.hymnLabel || "",
        nextSlideTitle:
          nextUp.title ||
          (nextUp.hymnLabel ? `${nextUp.hymnLabel} — ${nextUp.title}` : "") ||
          "",
        nextSlideContent: nextUp.content || nextUp.text || "",
        isLive: true,
        isBlack: false,
        isBlank: false,
        ...mediaOverrides(toPresent),
      });
      toast.success(`Broadcasting "${toPresent.title || "slide"}" Live`);
    }
  };

  const handleTransportStop = () => {
    setIsLive(false);
    broadcastToPresentation({ isLive: false });
    toast.info("Presentation output in Standby mode");
  };

  const handleToggleBlack = () => {
    const nextState = !isBlack;
    setIsBlack(nextState);
    broadcastToPresentation({ isBlack: nextState });
    if (nextState) {
      toast.warning("Blackout screen active");
    } else {
      toast.info("Blackout screen off");
    }
  };

  const handleToggleClear = () => {
    setCurrentSlide({});
    setMediaPage(0);
    setNextSlide({});
    setHymnDeck([]);
    setHymnDeckIndex(0);
    setIsLive(true);
    setIsBlack(false);
    setIsBlank(true);

    broadcastToPresentation({
      title: "",
      content: "",
      secondaryText: "",
      secondaryTranslation: "",
      nextSlideTitle: "",
      nextSlideContent: "",
      type: "Bible Verse",
      isLive: true,
      isBlack: false,
      isBlank: true,
    });
    toast.info("Live output and staged next slide cleared");
  };

  const handleTransportPrev = () => {
    if (isPagingPdf) {
      if (mediaPage > 0) setMediaPage(mediaPage - 1);
      return;
    }
    if (hymnDeck.length > 1 && hymnDeckIndex > 0) {
      const prevIdx = hymnDeckIndex - 1;
      setHymnDeckIndex(prevIdx);
      setNextSlide(hymnDeck[prevIdx]);
      toast.info(`Staged ${hymnDeck[prevIdx].hymnLabel || "stanza"} as Next`);
      return;
    }
    if (selectedVerseIndex > 0) {
      const prevVerse = filteredVerses[selectedVerseIndex - 1];
      const secPrev = getVerseWithSecondary(prevVerse);
      setSelectedVerseIndex(selectedVerseIndex - 1);
      setNextSlide({
        id: `verse-${secPrev.id}`,
        title: secPrev.ref || `${secPrev.ref} (${selectedTranslation})`,
        content: secPrev.text,
        secondaryText: secPrev.secondaryText || "",
        secondaryTranslation: secPrev.secondaryTranslation || "",
        type: "Bible Verse",
      });
      toast.info(`Staged ${secPrev.ref || "verse"} as Next`);
    }
  };

  const handleTransportNext = () => {
    if (isPagingPdf) {
      if (mediaPage < mediaPageCount - 1) setMediaPage(mediaPage + 1);
      return;
    }
    if (hymnDeck.length > 1 && hymnDeckIndex < hymnDeck.length - 1) {
      const nextIdx = hymnDeckIndex + 1;
      setHymnDeckIndex(nextIdx);
      setNextSlide(hymnDeck[nextIdx]);
      toast.info(`Staged ${hymnDeck[nextIdx].hymnLabel || "stanza"} as Next`);
      return;
    }
    if (selectedVerseIndex < filteredVerses.length - 1) {
      const nextV = filteredVerses[selectedVerseIndex + 1];
      const secNext = getVerseWithSecondary(nextV);
      setSelectedVerseIndex(selectedVerseIndex + 1);
      setNextSlide({
        id: `verse-${secNext.id}`,
        title: secNext.ref || `${secNext.ref} (${selectedTranslation})`,
        content: secNext.text,
        secondaryText: secNext.secondaryText || "",
        secondaryTranslation: secNext.secondaryTranslation || "",
        type: "Bible Verse",
      });
      toast.info(`Staged ${secNext.ref || "verse"} as Next`);
    }
  };

  // Advance to the next verse/stanza AND present it in one action.
  const handleTransportPresentNext = () => {
    const isHymnDeckActive =
      hymnDeck.length > 1 && currentSlide?.type === "Hymn";
    if (isHymnDeckActive) {
      if (hymnDeckIndex < hymnDeck.length - 1) {
        const nI = hymnDeckIndex + 1;
        const slide = hymnDeck[nI];
        const nextStanza = hymnDeck[nI + 1] || null;
        setHymnDeckIndex(nI);
        setCurrentSlide(slide);
        setNextSlide(nextStanza || {});
        setMediaPage(0);
        setIsLive(true);
        setIsBlack(false);
        setIsBlank(false);
        broadcastToPresentation({
          ...slide,
          nextSlideTitle: nextStanza
            ? (nextStanza.hymnLabel ? `${nextStanza.hymnLabel} — ${nextStanza.title}` : nextStanza.title)
            : "",
          nextSlideContent: nextStanza?.content || "",
          isLive: true,
          isBlack: false,
          isBlank: false,
        });
        toast.success(`Broadcasting "${slide.title || "slide"}" Live`);
        return;
      }
    }

    // If offline or presenting initial staged slide, transition it to live
    if (
      (!isLive || !currentSlide?.title) &&
      nextSlide &&
      (nextSlide.title ||
        nextSlide.content ||
        nextSlide.mediaName ||
        nextSlide.mediaUrl ||
        nextSlide.youtubeId)
    ) {
      handleTransportPresent();
      return;
    }

    // Bible Verse deck progression
    if (Array.isArray(filteredVerses) && filteredVerses.length > 0) {
      let currentIndex = selectedVerseIndex;
      if (currentSlide?.verse != null) {
        const matchIdx = filteredVerses.findIndex(
          (v) => Number(v.verse) === Number(currentSlide.verse)
        );
        if (matchIdx >= 0) currentIndex = matchIdx;
      }

      if (currentIndex < filteredVerses.length - 1) {
        const nI = currentIndex + 1;
        const nextV = getVerseWithSecondary(filteredVerses[nI]);
        const followingV = filteredVerses[nI + 1]
          ? getVerseWithSecondary(filteredVerses[nI + 1])
          : null;

        const updatedLive = {
          id: `verse-${nextV.id}`,
          title: nextV.ref || `${nextV.ref} (${selectedTranslation})`,
          content: nextV.text,
          secondaryText: nextV.secondaryText || "",
          secondaryTranslation: nextV.secondaryTranslation || "",
          type: "Bible Verse",
          book: nextV.book,
          chapter: nextV.chapter,
          verse: nextV.verse,
        };

        const updatedNext = followingV
          ? {
              id: `verse-${followingV.id}`,
              title: followingV.ref || `${followingV.ref} (${selectedTranslation})`,
              content: followingV.text,
              secondaryText: followingV.secondaryText || "",
              secondaryTranslation: followingV.secondaryTranslation || "",
              type: "Bible Verse",
              book: followingV.book,
              chapter: followingV.chapter,
              verse: followingV.verse,
            }
          : {};

        if (setSelectedVerseIndex) setSelectedVerseIndex(nI);
        setCurrentSlide(updatedLive);
        setNextSlide(updatedNext);
        setMediaPage(0);
        setIsLive(true);
        setIsBlack(false);
        setIsBlank(false);

        broadcastToPresentation({
          ...updatedLive,
          nextSlideTitle: followingV ? followingV.ref || "" : "",
          nextSlideContent: followingV ? followingV.text || "" : "",
          isLive: true,
          isBlack: false,
          isBlank: false,
        });
        toast.success(`Broadcasting "${updatedLive.title || "slide"}" Live`);
        return;
      }
    }

    if (
      nextSlide &&
      (nextSlide.title ||
        nextSlide.content ||
        nextSlide.mediaName ||
        nextSlide.mediaUrl ||
        nextSlide.youtubeId)
    ) {
      handleTransportPresent();
    }
  };

  // Go back to the previous verse/stanza AND present it in one action.
  const handleTransportPresentPrev = () => {
    const isHymnDeckActive =
      hymnDeck.length > 1 && currentSlide?.type === "Hymn";
    if (isHymnDeckActive) {
      if (hymnDeckIndex > 0) {
        const pI = hymnDeckIndex - 1;
        const slide = hymnDeck[pI];
        const nextStanza = hymnDeck[pI + 1] || null;
        setHymnDeckIndex(pI);
        setCurrentSlide(slide);
        setNextSlide(nextStanza || {});
        setMediaPage(0);
        setIsLive(true);
        setIsBlack(false);
        setIsBlank(false);
        broadcastToPresentation({
          ...slide,
          nextSlideTitle: nextStanza
            ? (nextStanza.hymnLabel ? `${nextStanza.hymnLabel} — ${nextStanza.title}` : nextStanza.title)
            : "",
          nextSlideContent: nextStanza?.content || "",
          isLive: true,
          isBlack: false,
          isBlank: false,
        });
        return;
      }
    }

    if (Array.isArray(filteredVerses) && filteredVerses.length > 0) {
      let currentIndex = selectedVerseIndex;
      if (currentSlide?.verse != null) {
        const matchIdx = filteredVerses.findIndex(
          (v) => Number(v.verse) === Number(currentSlide.verse)
        );
        if (matchIdx >= 0) currentIndex = matchIdx;
      }

      if (currentIndex > 0) {
        const pI = currentIndex - 1;
        const prevV = getVerseWithSecondary(filteredVerses[pI]);
        const nextV = getVerseWithSecondary(filteredVerses[pI + 1]);

        const updatedLive = {
          id: `verse-${prevV.id}`,
          title: prevV.ref || `${prevV.ref} (${selectedTranslation})`,
          content: prevV.text,
          secondaryText: prevV.secondaryText || "",
          secondaryTranslation: prevV.secondaryTranslation || "",
          type: "Bible Verse",
          book: prevV.book,
          chapter: prevV.chapter,
          verse: prevV.verse,
        };

        const updatedNext = nextV
          ? {
              id: `verse-${nextV.id}`,
              title: nextV.ref || `${nextV.ref} (${selectedTranslation})`,
              content: nextV.text,
              secondaryText: nextV.secondaryText || "",
              secondaryTranslation: nextV.secondaryTranslation || "",
              type: "Bible Verse",
              book: nextV.book,
              chapter: nextV.chapter,
              verse: nextV.verse,
            }
          : {};

        if (setSelectedVerseIndex) setSelectedVerseIndex(pI);
        setCurrentSlide(updatedLive);
        setNextSlide(updatedNext);
        setMediaPage(0);
        setIsLive(true);
        setIsBlack(false);
        setIsBlank(false);

        broadcastToPresentation({
          ...updatedLive,
          nextSlideTitle: nextV ? nextV.ref || "" : "",
          nextSlideContent: nextV ? nextV.text || "" : "",
          isLive: true,
          isBlack: false,
          isBlank: false,
        });
      }
    }
  };

  return {
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
    mediaPage,
    mediaPageCount,
    setMediaPageCount,
    isPagingPdf,
    mediaReplay,
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
  };
}
