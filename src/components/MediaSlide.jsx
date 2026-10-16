import React, { useEffect, useRef, useState } from "react";

// PDF rendering. pdfjs-dist is the only dependency added for the media work, and
// it is the reason PowerPoint decks are accepted as PDF rather than parsed as
// .pptx: PowerPoint renders the file, we just draw the pages.
//
// It is imported dynamically so its ~900 kB stays out of the main bundle: a
// service that never shows a PDF never downloads or parses it. The worker URL is
// a plain string, so it is safe to import eagerly — Vite emits it as its own
// asset and it is only fetched when a worker is actually created.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let pdfjsPromise = null;
const loadPdfjs = () => {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    });
  }
  return pdfjsPromise;
};

const FIT_CLASS = {
  contain: "object-contain",
  cover: "object-cover",
};

export { extractYouTubeId } from "../lib/youtube.js";
import { extractYouTubeId } from "../lib/youtube.js";

/**
 * Renders one media slide: image, video, YouTube stream, or the first page of a PDF.
 *
 * `allowAudio` is false on every window except one projector and the stage
 * display, so a clip's sound is heard once rather than once per screen.
 */
export default function MediaSlide({
  type,
  url,
  youtubeId,
  fit = "contain",
  allowAudio = false,
  label = "",
  page = 0,
  onPageCount,
  replayKey = 0,
}) {
  const [imageError, setImageError] = useState(false);

  // A dead network does not make the iframe throw — it just leaves a black
  // rectangle on the projector while navigator.onLine still claims to be online
  // (DNS/SSL failures do not flip it). So the embed's own host is pinged
  // continuously and the iframe is swapped for a readable error while unreachable.
  const isYouTubeSlide = type === "youtube" || !!youtubeId;
  const [netError, setNetError] = useState(false);

  useEffect(() => {
    if (!isYouTubeSlide) return;
    let cancelled = false;
    const check = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!cancelled) setNetError(true);
        return;
      }
      try {
        await fetch("https://www.youtube-nocookie.com/favicon.ico", {
          method: "GET",
          mode: "no-cors",
          cache: "no-store",
          signal: AbortSignal.timeout(6000),
        });
        if (!cancelled) setNetError(false);
      } catch {
        if (!cancelled) setNetError(true);
      }
    };
    check();
    const timer = setInterval(check, 8000);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
    };
  }, [isYouTubeSlide]);

  if (type === "youtube" || youtubeId) {
    const videoId = youtubeId || extractYouTubeId(url);
    if (!videoId) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-red-400 p-4 text-center">
          <span className="font-bold text-xs uppercase tracking-wide">Invalid YouTube Link</span>
          <span className="text-[11px] text-white/60 mt-1">Please check the pasted YouTube URL or video ID</span>
        </div>
      );
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 text-amber-400 p-6 text-center space-y-2">
          <span className="text-sm font-bold uppercase tracking-wider">Offline — Internet Connection Required</span>
          <p className="text-xs text-white/70 max-w-md">YouTube video playback requires an active internet connection.</p>
        </div>
      );
    }

    if (netError) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 text-amber-400 p-6 text-center space-y-2">
          <span className="text-sm font-bold uppercase tracking-wider">Can't Reach YouTube</span>
          <p className="text-xs text-white/70 max-w-md">
            The internet is not working or is unstable, so the video cannot load.
            Check the Wi-Fi or network cable.
          </p>
          <span className="text-[11px] text-white/50">Reconnecting automatically…</span>
        </div>
      );
    }

    const autoplayParam = allowAudio ? "autoplay=1&mute=0" : "autoplay=1&mute=1";
    const embedBase = `https://www.youtube-nocookie.com/embed/${videoId}`;
    const embedUrl = `${embedBase}?${autoplayParam}&enablejsapi=1&rel=0`;
    return (
      <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center overflow-hidden">
        <iframe
          key={`${videoId}-${replayKey}`}
          src={embedUrl}
          title={label || "YouTube Video"}
          className="w-full h-full border-0"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  if (type === "video") {
    return (
      <video
        key={`${url}-${replayKey}`}
        src={url}
        autoPlay
        loop
        muted={!allowAudio}
        playsInline
        className={`absolute inset-0 w-full h-full ${FIT_CLASS[fit] || FIT_CLASS.contain}`}
      />
    );
  }

  if (type === "pdf") {
    return <PdfPage url={url} fit={fit} page={page} onPageCount={onPageCount} />;
  }

  if (imageError) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-amber-300 p-4 text-center">
        <span className="font-bold text-xs uppercase tracking-wide">Image Unavailable</span>
        <span className="text-[11px] text-white/60 mt-1">
          The file could not be loaded — it may have been moved or renamed, or it is in a format
          the projector cannot read.
        </span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={label || ""}
      onError={() => setImageError(true)}
      className={`absolute inset-0 w-full h-full ${FIT_CLASS[fit] || FIT_CLASS.contain}`}
    />
  );
}

function PdfPage({ url, fit, page = 0, onPageCount }) {
  const canvasRef = useRef(null);
  const docRef = useRef(null);
  const [pageCount, setPageCount] = useState(0);
  const [failed, setFailed] = useState(false);

  // The document is parsed once per file. Advancing pages redraws the canvas
  // rather than re-reading a multi-megabyte PDF on every Next press.
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setPageCount(0);
    docRef.current = null;

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ url, withCredentials: false }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        docRef.current = doc;
        setPageCount(doc.numPages);
        if (onPageCount) onPageCount(doc.numPages);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // onPageCount is intentionally not a dependency: the control window passes a
    // fresh closure each render, and reloading the PDF for that would be absurd.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    let cancelled = false;

    (async () => {
      try {
        const index = Math.min(Math.max(page, 0), doc.numPages - 1);
        const target = await doc.getPage(index + 1);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        // Render at the display's own pixel density, capped so a huge page does
        // not try to rasterise at 4x on a 4K projector.
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = target.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await target.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, pageCount]);

  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-red-300 text-sm">
        Could not read this PDF
      </div>
    );
  }

  const current = Math.min(page + 1, Math.max(pageCount, 1));

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className={`max-w-full max-h-full ${fit === "cover" ? "w-full h-full object-cover" : "object-contain"}`}
      />
      {pageCount > 1 && (
        <div className="absolute bottom-4 right-6 text-xs text-white/70 bg-black/50 px-2 py-1 rounded">
          Page {current} of {pageCount}
        </div>
      )}
    </div>
  );
}

/**
 * Small preview of a media slide for the control-window rail, so the operator can
 * see what is on air and what is staged without switching windows. Reuses
 * MediaSlide so a preview and the projector can never disagree about a file.
 * Audio is never played here.
 */
export function MediaThumb({ type, name, url: directUrl, youtubeId, fit, page = 0, onPageCount }) {
  const [resolvedUrl, setResolvedUrl] = useState(directUrl || null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (directUrl) {
      setResolvedUrl(directUrl);
      setMissing(false);
      return;
    }
    if (!name || !window.api || !window.api.resolveMediaUrls) return;
    let cancelled = false;
    window.api.resolveMediaUrls([name]).then((map) => {
      if (cancelled) return;
      const resolved = map?.[name]?.url || null;
      setResolvedUrl(resolved);
      setMissing(!resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [name, directUrl]);

  if (type === "youtube" || youtubeId) {
    const yId = youtubeId || extractYouTubeId(directUrl || name);
    const thumbUrl = yId
      ? ["https:", "", "img.youtube.com", "vi", yId, "hqdefault.jpg"].join("/")
      : null;
    return (
      <div className="relative w-full aspect-video rounded overflow-hidden bg-black mt-1.5 flex items-center justify-center group">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt="YouTube Thumbnail"
            className="w-full h-full object-cover opacity-80"
          />
        ) : null}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-red-600/90 flex items-center justify-center text-white text-xs font-bold shadow-lg">
            ▶
          </div>
        </div>
      </div>
    );
  }

  if (!name && !directUrl) return null;

  if (missing) {
    return (
      <div className="w-full aspect-video rounded border border-red-500/50 bg-red-950/30 flex items-center justify-center text-[10px] font-bold uppercase tracking-wide text-red-300 px-2 text-center">
        File missing
      </div>
    );
  }

  if (!resolvedUrl) return null;

  return (
    <div className="relative w-full aspect-video rounded overflow-hidden bg-black/40 mt-1.5">
      <MediaSlide
        type={type}
        url={resolvedUrl}
        fit={fit || "contain"}
        allowAudio={false}
        page={page}
        onPageCount={onPageCount}
      />
    </div>
  );
}
