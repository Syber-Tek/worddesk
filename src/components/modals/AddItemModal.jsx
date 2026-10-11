import React, { useState, useEffect } from "react";
import { Plus, CloseSquare, Edit } from "react-iconly";
import { FaYoutube, FaImage } from "react-icons/fa6";
import { isVideo, defaultFit } from "../../lib/mediaKinds.js";
import { MediaThumb, extractYouTubeId } from "../MediaSlide";

const MEDIA_TYPE = "Media Slide";

export default function AddItemModal({
  showAddModal,
  setShowAddModal,
  newItemTitle,
  setNewItemTitle,
  newItemContent,
  setNewItemContent,
  newItemType,
  setNewItemType,
  handleAddItem,
  handleAddMediaItems,
  onEdit,
  editingItem = null,
  themeMode,
}) {
  // Picked media is held here and handed to the parent as one batch. The files
  // themselves are already copied into the app's media folder by the time we get
  // this far, so there is no uploading and no pending state to babysit.
  const [picked, setPicked] = useState([]);
  const [fit, setFit] = useState("contain");
  // Which picked file the preview is showing. Picking a different file resets
  // this so the preview never shows a stale frame next to a new filename.
  const [previewIdx, setPreviewIdx] = useState(0);
  const [muted, setMuted] = useState(true);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState("");

  // Online media state (YouTube & Web Images)
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  // Editing an existing row rather than adding a new one. The media fields are
  // seeded from the item so Fit, sound and the file itself stay editable.
  const editing = !!editingItem;

  useEffect(() => {
    if (!editingItem) {
      setPicked([]);
      setPreviewIdx(0);
      setYoutubeUrl("");
      setImageUrl("");
      return;
    }
    if (editingItem.mediaType === "youtube" || editingItem.type === "YouTube Video") {
      setYoutubeUrl(editingItem.mediaUrl || editingItem.content || "");
      setNewItemType("YouTube Video");
      setNewItemTitle(editingItem.title || "");
    } else if (editingItem.mediaUrl && (editingItem.mediaType === "image" || editingItem.type === "Online Image")) {
      setImageUrl(editingItem.mediaUrl);
      setNewItemType("Online Image");
      setNewItemTitle(editingItem.title || "");
      setFit(editingItem.mediaFit || "contain");
    } else if (editingItem.mediaName) {
      setPicked([
        {
          storedName: editingItem.mediaName,
          kind: editingItem.mediaType,
          sourceName: editingItem.title,
        },
      ]);
      setFit(editingItem.mediaFit || "contain");
      setMuted(editingItem.mediaMuted !== false);
    } else {
      setPicked([]);
    }
    setPreviewIdx(0);
  }, [editingItem, setNewItemType, setNewItemTitle]);

  if (!showAddModal) return null;

  const isLight = themeMode === "light";
  const isMedia = newItemType === MEDIA_TYPE;
  const isYouTube = newItemType === "YouTube Video";
  const isOnlineImage = newItemType === "Online Image";
  const pickedVideo = picked.some((entry) => isVideo(entry.storedName));

  const runPick = async (fn) => {
    setPicking(true);
    setPickError("");
    try {
      const result = await fn();
      if (!result || !result.success) {
        if (result && result.message && result.message !== "Cancelled") {
          setPickError(result.message);
        }
        return;
      }
      const incoming = result.media || [];
      if (editing) {
        // Editing replaces the file outright rather than queueing another one.
        // The title tracks the new file, because a media slide's title is its
        // filename by design.
        setPicked(incoming);
        setPreviewIdx(0);
        if (incoming.length > 0) {
          setFit(defaultFit(incoming[0].kind));
          setNewItemTitle(incoming[0].sourceName || incoming[0].storedName);
        }
      } else {
        setPicked((prev) => {
          const seen = new Set(prev.map((entry) => entry.storedName));
          return [...prev, ...incoming.filter((entry) => !seen.has(entry.storedName))];
        });
        // Fit defaults follow the kind: video fills the screen, an image or a
        // 4:3 slide is shown whole rather than cropped.
        if (incoming.length > 0) {
          setFit(defaultFit(incoming[0].kind));
          setPreviewIdx(0);
        }
      }
      if (result.skipped && result.skipped.length > 0) {
        setPickError(`Skipped ${result.skipped.length} unsupported file(s)`);
      }
    } catch (err) {
      setPickError(String((err && err.message) || err));
    } finally {
      setPicking(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (isYouTube) {
      const vId = extractYouTubeId(youtubeUrl);
      if (!vId) {
        setPickError("Please enter a valid YouTube video URL or ID");
        return;
      }
      const title = newItemTitle.trim() || "YouTube Video";
      if (editing) {
        onEdit({
          title,
          content: youtubeUrl.trim(),
          type: "YouTube Video",
          mediaType: "youtube",
          mediaUrl: youtubeUrl.trim(),
          youtubeId: vId,
        });
      } else {
        handleAddItem(e, {
          title,
          content: youtubeUrl.trim(),
          type: "YouTube Video",
          mediaType: "youtube",
          mediaUrl: youtubeUrl.trim(),
          youtubeId: vId,
        });
        setYoutubeUrl("");
        setNewItemTitle("");
        setPickError("");
      }
      return;
    }
    if (isOnlineImage) {
      if (!imageUrl.trim()) {
        setPickError("Please enter an image web URL");
        return;
      }
      const title = newItemTitle.trim() || "Online Image";
      if (editing) {
        onEdit({
          title,
          content: imageUrl.trim(),
          type: "Online Image",
          mediaType: "image",
          mediaUrl: imageUrl.trim(),
          mediaFit: fit,
        });
      } else {
        handleAddItem(e, {
          title,
          content: imageUrl.trim(),
          type: "Online Image",
          mediaType: "image",
          mediaUrl: imageUrl.trim(),
          mediaFit: fit,
        });
        setImageUrl("");
        setNewItemTitle("");
        setPickError("");
      }
      return;
    }
    if (isMedia) {
      if (picked.length === 0) {
        setPickError("Choose at least one file first");
        return;
      }
      if (editing) {
        const entry = picked[0];
        onEdit({
          title: newItemTitle || entry.sourceName || entry.storedName,
          content: "",
          type: MEDIA_TYPE,
          mediaType: entry.kind,
          mediaName: entry.storedName,
          mediaFit: fit,
          mediaMuted: muted,
        });
      } else {
        handleAddMediaItems(picked, { fit, muted });
        setPicked([]);
        setPickError("");
      }
      return;
    }
    if (editing) {
      onEdit({
        title: newItemTitle,
        content: newItemContent,
        type: newItemType,
      });
      return;
    }
    handleAddItem(e);
  };

  const labelCls = `text-[11px] block mb-1 font-semibold ${isLight ? "text-[#4B5563]" : "text-[#9B9CA3]"}`;
  const inputCls = `w-full border rounded px-3 py-2 text-xs outline-none ${
    isLight
      ? "bg-[#F3F4F6] border-[#E5E7EB] text-[#111827] placeholder-[#9CA3AF]"
      : "bg-[#1C1D21] border-[#2A2C31] text-text-primary placeholder-[#6B6C73]"
  }`;
  const btnCls = `px-3 py-1.5 rounded text-xs font-medium transition ${
    isLight
      ? "bg-[#E5E7EB] text-[#4B5563] hover:bg-[#111827]"
      : "bg-[#24262B] text-[#9B9CA3] hover:text-text-primary"
  }`;

  return (
    <div
      className={`fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4 ${
        isLight ? "bg-black/30" : "bg-bg/60"
      }`}
    >
      <div
        className={`border rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4 transition-colors duration-200 ${
          isLight
            ? "bg-[#FFFFFF] border-[#E5E7EB] text-[#111827]"
            : "bg-[#151619] border-[#2A2C31] text-text-primary"
        }`}
      >
        <div
          className={`flex justify-between items-center border-b pb-3 ${
            isLight ? "border-[#E5E7EB]" : "border-[#2A2C31]"
          }`}
        >
          <h3 className="text-sm font-bold text-accent flex items-center gap-2">
            {editing ? (
              <>
                <Edit set="bold" primaryColor="#D4A94A" size="small" /> Edit
                Service Playlist Item
              </>
            ) : (
              <>
                <Plus set="bold" primaryColor="#D4A94A" size="small" /> Add New
                Service Playlist Item
              </>
            )}
          </h3>
          <button
            onClick={() => {
              setShowAddModal(false);
              if (onEdit) onEdit(null);
            }}
            className={`transition cursor-pointer ${isLight ? "text-[#6B7280] hover:text-[#111827]" : "text-[#6B6C73] hover:text-text-primary"}`}
          >
            <CloseSquare
              set="light"
              primaryColor="currentColor"
              size="medium"
            />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label
              className={`text-[11px] block mb-1 font-semibold ${isLight ? "text-[#4B5563]" : "text-[#9B9CA3]"}`}
            >
              Item Type
            </label>
            <select
              value={newItemType}
              onChange={(e) => setNewItemType(e.target.value)}
              className={`w-full border rounded px-3 py-2 text-xs outline-none ${
                isLight
                  ? "bg-[#F3F4F6] border-[#E5E7EB] text-[#111827]"
                  : "bg-[#1C1D21] border-[#2A2C31] text-text-primary"
              }`}
            >
              <option value="Bible Verse">Bible Verse</option>
              <option value="Hymn">Hymn / Song</option>
              <option value="Custom Slide">Custom Sermon Slide</option>
              <option value="Announcement">Announcement</option>
              <option value={MEDIA_TYPE}>Media Slide (Local Image / Video / PDF)</option>
              <option value="YouTube Video">YouTube Video (Online Stream)</option>
              <option value="Online Image">Online Image (Web URL)</option>
            </select>
          </div>

          {isYouTube ? (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>
                  YouTube Video Link or ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. https://www.youtube.com/watch?v=... or youtu.be/..."
                    value={youtubeUrl}
                    onChange={(e) => {
                      setYoutubeUrl(e.target.value);
                      setPickError("");
                    }}
                    className={inputCls}
                  />
                </div>
                <p className={`mt-1 text-[10px] ${isLight ? "text-[#6B7280]" : "text-[#6B6C73]"}`}>
                  Paste any YouTube URL (standard, shortened youtu.be, or video ID). Streams live on the projector when connected to the internet.
                </p>
              </div>

              <div>
                <label className={labelCls}>
                  Slide Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Opening Worship Video"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  className={inputCls}
                />
              </div>

              {extractYouTubeId(youtubeUrl) && (
                <div>
                  <span className={labelCls}>Thumbnail Preview</span>
                  <div className={`rounded border overflow-hidden ${isLight ? "border-[#E5E7EB]" : "border-[#2A2C31]"}`}>
                    <MediaThumb
                      type="youtube"
                      youtubeId={extractYouTubeId(youtubeUrl)}
                    />
                  </div>
                </div>
              )}

              {pickError && (
                <p className="text-[10px] text-red-400 font-semibold">{pickError}</p>
              )}
            </div>
          ) : isOnlineImage ? (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>
                  Image Web URL
                </label>
                <input
                  type="text"
                  placeholder="https://images.unsplash.com/... or https://...jpg"
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value);
                    setPickError("");
                  }}
                  className={inputCls}
                />
                <p className={`mt-1 text-[10px] ${isLight ? "text-[#6B7280]" : "text-[#6B6C73]"}`}>
                  Paste a direct link to any web image (JPG, PNG, WebP).
                </p>
              </div>

              <div>
                <label className={labelCls}>
                  Slide Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Welcome Wallpaper"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <span className={labelCls}>Fit</span>
                <div className="flex gap-2">
                  {["contain", "cover"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setFit(option)}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition cursor-pointer ${
                        fit === option
                          ? "bg-accent text-bg font-bold"
                          : isLight
                            ? "bg-[#E5E7EB] text-[#4B5563]"
                            : "bg-[#24262B] text-[#9B9CA3]"
                      }`}
                    >
                      {option === "contain" ? "Show whole" : "Fill screen"}
                    </button>
                  ))}
                </div>
              </div>

              {imageUrl.trim() && (
                <div>
                  <span className={labelCls}>Image Preview</span>
                  <div className={`rounded border overflow-hidden aspect-video bg-black/40 relative flex items-center justify-center ${isLight ? "border-[#E5E7EB]" : "border-[#2A2C31]"}`}>
                    <img
                      src={imageUrl.trim()}
                      alt="Preview"
                      className={`w-full h-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                </div>
              )}

              {pickError && (
                <p className="text-[10px] text-red-400 font-semibold">{pickError}</p>
              )}
            </div>
          ) : isMedia ? (
            <div className="space-y-2">
              <div>
                <span className={labelCls}>Files</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={picking}
                    onClick={() => runPick(() => window.api.pickMediaFiles())}
                    className={`${btnCls} disabled:opacity-50`}
                  >
                    {picking ? "Reading..." : editing ? "Replace file" : "Choose file(s)"}
                  </button>
                  <button
                    type="button"
                    disabled={picking}
                    onClick={() => runPick(() => window.api.pickSlideFolder())}
                    className={`${btnCls} disabled:opacity-50`}
                  >
                    Import slide folder
                  </button>
                </div>
                <p className={`mt-1 text-[10px] ${isLight ? "text-[#6B7280]" : "text-[#6B6C73]"}`}>
                  For PowerPoint, export your slides as PNG images or a PDF first, then
                  pick them here. Each file becomes one slide in the service order.
                </p>
              </div>

              {picked.length > 0 && (
                <>
                  <div className={`border rounded px-2 py-1.5 max-h-24 overflow-y-auto ${isLight ? "border-[#E5E7EB] bg-[#F9FAFB]" : "border-[#2A2C31] bg-[#1C1D21]"}`}>
                    {picked.map((entry, i) => (
                      <button
                        type="button"
                        key={entry.storedName}
                        onClick={() => setPreviewIdx(i)}
                        className={`flex w-full items-center justify-between gap-2 text-[10px] py-0.5 px-1 rounded text-left transition ${
                          i === previewIdx
                            ? isLight
                              ? "bg-[#E5E7EB]"
                              : "bg-[#24262B]"
                            : "hover:opacity-80"
                        }`}
                      >
                        <span className="truncate">{entry.sourceName || entry.storedName}</span>
                        <span className={`shrink-0 uppercase ${isLight ? "text-[#6B7280]" : "text-[#6B6C73]"}`}>
                          {entry.kind}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* What the projector will actually show, at the fit that is
                      currently selected. Toggling Fit below re-frames this. */}
                  <div>
                    <span className={labelCls}>Preview</span>
                    <div className={`rounded border overflow-hidden ${isLight ? "border-[#E5E7EB]" : "border-[#2A2C31]"}`}>
                      <MediaThumb
                        type={picked[previewIdx]?.kind}
                        name={picked[previewIdx]?.storedName}
                        fit={fit}
                      />
                    </div>
                    <p className={`text-[10px] mt-1 ${isLight ? "text-[#6B7280]" : "text-[#6B6C73]"}`}>
                      {fit === "contain"
                        ? "Show whole — the entire file is visible, with bars if the shapes differ."
                        : "Fill screen — the screen is always full, but the edges are cropped."}
                    </p>
                  </div>
                </>
              )}

              <div>
                <span className={labelCls}>Fit</span>
                <div className="flex gap-2">
                  {["contain", "cover"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setFit(option)}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                        fit === option
                          ? "bg-accent text-bg font-bold"
                          : isLight
                            ? "bg-[#E5E7EB] text-[#4B5563]"
                            : "bg-[#24262B] text-[#9B9CA3]"
                      }`}
                    >
                      {option === "contain" ? "Show whole" : "Fill screen"}
                    </button>
                  ))}
                </div>
              </div>

              {pickedVideo && (
                <label className={`flex items-center gap-2 text-xs ${isLight ? "text-[#4B5563]" : "text-[#9B9CA3]"}`}>
                  <input
                    type="checkbox"
                    checked={muted}
                    onChange={(e) => setMuted(e.target.checked)}
                  />
                  Play video without sound (off when sound is handled by vMix)
                </label>
              )}

              {pickError && (
                <p className="text-[10px] text-red-400">{pickError}</p>
              )}
            </div>
          ) : (
            <>

          <div>
            <label
              className={`text-[11px] block mb-1 font-semibold ${isLight ? "text-[#4B5563]" : "text-[#9B9CA3]"}`}
            >
              Item Title / Heading
            </label>
            <input
              type="text"
              placeholder="e.g. Sermon Note: Living by Faith"
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              className={`w-full border rounded px-3 py-2 text-xs outline-none focus:border-accent ${
                isLight
                  ? "bg-[#F3F4F6] border-[#E5E7EB] text-[#111827] placeholder-[#9CA3AF]"
                  : "bg-[#1C1D21] border-[#2A2C31] text-text-primary placeholder-[#6B6C73]"
              }`}
            />
          </div>

          <div>
            <label
              className={`text-[11px] block mb-1 font-semibold ${isLight ? "text-[#4B5563]" : "text-[#9B9CA3]"}`}
            >
              Slide Body Content / Text
            </label>
            <textarea
              rows={3}
              placeholder="Enter scripture verse, song stanza, or announcement text..."
              value={newItemContent}
              onChange={(e) => setNewItemContent(e.target.value)}
              className={`w-full border rounded px-3 py-2 text-xs outline-none focus:border-accent ${
                isLight
                  ? "bg-[#F3F4F6] border-[#E5E7EB] text-[#111827] placeholder-[#9CA3AF]"
                  : "bg-[#1C1D21] border-[#2A2C31] text-text-primary placeholder-[#6B6C73]"
              }`}
            />
          </div>
            </>
          )}

          <div
            className={`flex justify-end gap-2 pt-2 border-t ${isLight ? "border-[#E5E7EB]" : "border-[#2A2C31]"}`}
          >
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                isLight
                  ? "bg-[#E5E7EB] text-[#4B5563] hover:text-[#111827]"
                  : "bg-[#24262B] text-[#9B9CA3] hover:text-text-primary"
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-accent text-bg font-bold rounded text-xs shadow hover:bg-accent/90 transition"
            >
              {editing ? "Save Changes" : "Add Item"}
            </button>          </div>
        </form>
      </div>
    </div>
  );
}
