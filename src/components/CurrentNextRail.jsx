import React from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Hide,
  CloseSquare,
  Play,
  Delete,
  Activity,
  Video
} from 'react-iconly'
import { FaDisplay, FaEraser, FaEyeSlash, FaLock, FaLockOpen, FaTextHeight } from 'react-icons/fa6'
import { MediaThumb } from './MediaSlide'
import FontScaleSlider from './FontScaleSlider'

export default function CurrentNextRail({
  currentSlide,
  nextSlide,
  isLive,
  isBlack,
  isBlank,
  selectedVerseIndex,
  filteredVersesLength,
  hymnDeckActive = false,
  presentNextDisabled,
  presentPrevDisabled,
  handleTransportPrev,
  handleTransportNext,
  handleTransportPresentNext,
  handleTransportPresentPrev,
  handleToggleClear,
  handleToggleBlack,
  handleTransportPresent,
  handleTransportStop,
  themeMode,
  displays = [],
  projectionDisplays = [],
  setProjectionDisplays,
  outputTheme = 'dark',
  setOutputTheme,
  outputFontSize = 'normal',
  setOutputFontSize,
  mediaPage = 0,
  onMediaPageCount,
  isPagingPdf = false,
  mediaPageCount = 0,
  onReplayVideo
}) {
  const isLight = themeMode === 'light'

  // While a PDF is on air, Next/Prev step its pages. Otherwise they step Bible
  // verses or hymn stanzas.
  const prevDisabled = isPagingPdf
    ? mediaPage <= 0
    : isLive
    ? presentPrevDisabled
    : hymnDeckActive || selectedVerseIndex <= 0
  const nextDisabled = isPagingPdf
    ? mediaPage >= mediaPageCount - 1
    : isLive
    ? presentNextDisabled
    : hymnDeckActive || selectedVerseIndex >= filteredVersesLength - 1

  return (
    <aside
      className={`w-57.5 border-l flex flex-col justify-between p-3 select-none z-10 text-xs shrink-0 transition-colors duration-200 ${
        isLight
          ? 'bg-[#FFFFFF] border-[#E5E7EB]'
          : 'bg-panel border-border'
      }`}
    >
      <div className="space-y-4">
        {/* CURRENT LIVE CARD */}
        <div
          className={`border rounded-lg p-3 space-y-2 relative transition ${
            isLive
              ? 'bg-live/10 border-live'
              : isLight
              ? 'bg-[#F9FAFB] border-[#E5E7EB]'
              : 'bg-[#1C1D21] border-[#2A2C31]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-live flex items-center gap-1">
              <Activity set="bold" primaryColor="#E5484D" size="small" /> LIVE OUTPUT
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                isLive ? 'bg-live text-white animate-pulse' : isLight ? 'bg-[#E5E7EB] text-[#6B7280]' : 'bg-[#24262B] text-[#6B6C73]'
              }`}
            >
              {isLive ? 'ON AIR' : 'OFFLINE'}
            </span>
          </div>

          <div className="min-h-14 flex flex-col justify-center">
            {currentSlide?.mediaName || currentSlide?.mediaUrl || currentSlide?.mediaType === 'youtube' || currentSlide?.type === 'YouTube Video' ? (
              // A media slide's title is just its filename or stream name, and the thumbnail
              // below already shows the content. Name the kind instead.
              <h4 className={`font-bold text-xs ${isLight ? 'text-[#111827]' : 'text-text-primary'}`}>
                {currentSlide.mediaType === 'youtube' || currentSlide.type === 'YouTube Video'
                  ? 'YouTube Video'
                  : currentSlide.mediaType === 'pdf'
                    ? 'PDF slide'
                    : currentSlide.mediaType === 'video'
                      ? 'Video slide'
                      : 'Image slide'}
                {currentSlide.mediaMuted === false ? ' (with sound)' : ''}
              </h4>
            ) : currentSlide && (currentSlide.title || currentSlide.ref || currentSlide.content || currentSlide.text) ? (
              <>
                <h4 className={`font-bold text-xs ${isLight ? 'text-[#111827]' : 'text-text-primary'}`}>
                  {currentSlide.title || currentSlide.ref}
                </h4>
                <p className={`text-[11px] line-clamp-2 mt-0.5 ${isLight ? 'text-[#4B5563]' : 'text-[#9B9CA3]'}`}>
                  {currentSlide.content || currentSlide.text}
                </p>
              </>
            ) : (
              <p className={`text-[11px] italic ${isLight ? 'text-[#9CA3AF]' : 'text-[#6B6C73]'}`}>
                No active live slide projected
              </p>
            )}
            {(currentSlide?.mediaName || currentSlide?.mediaUrl || currentSlide?.mediaType === 'youtube' || currentSlide?.type === 'YouTube Video') && (
              <MediaThumb
                type={currentSlide.mediaType || (currentSlide.type === 'YouTube Video' ? 'youtube' : 'image')}
                name={currentSlide.mediaName}
                url={currentSlide.mediaUrl}
                youtubeId={currentSlide.youtubeId}
                fit={currentSlide.mediaFit}
                page={mediaPage}
                onPageCount={onMediaPageCount}
              />
            )}
            {(currentSlide?.mediaType === 'video' || currentSlide?.mediaType === 'youtube' || currentSlide?.type === 'YouTube Video') && onReplayVideo && (
              <button
                onClick={onReplayVideo}
                className="mt-1.5 w-full py-1.5 rounded text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer bg-accent hover:bg-accent/90 text-bg"
              >
                <Play set="bold" primaryColor="#0B0C0E" size="small" />
                Replay video
              </button>
            )}
          </div>
        </div>

        {/* NEXT STAGED CARD */}
        <div
          className={`border rounded-lg p-3 space-y-2 transition ${
            isLight
              ? 'bg-[#F3F4F6] border-accent'
              : 'bg-[#1C1D21] border-accent/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-accent flex items-center gap-1">
              <Activity set="bold" primaryColor="#D4A94A" size="small" /> NEXT STAGED
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isLight ? 'bg-[#E5E7EB] text-accent' : 'bg-[#24262B] text-accent'}`}>
              PREPARED
            </span>
          </div>

          <div className="min-h-14 flex flex-col justify-center">
            {nextSlide?.mediaName || nextSlide?.mediaUrl || nextSlide?.mediaType === 'youtube' || nextSlide?.type === 'YouTube Video' ? (
              <h4 className={`font-bold text-xs ${isLight ? 'text-[#111827]' : 'text-text-primary'}`}>
                {nextSlide.mediaType === 'youtube' || nextSlide.type === 'YouTube Video'
                  ? 'YouTube Video'
                  : nextSlide.mediaType === 'pdf'
                    ? 'PDF slide'
                    : nextSlide.mediaType === 'video'
                      ? 'Video slide'
                      : 'Image slide'}
              </h4>
            ) : nextSlide && (nextSlide.title || nextSlide.content || nextSlide.text || nextSlide.ref) ? (
              <>
                <h4 className={`font-bold text-xs ${isLight ? 'text-[#111827]' : 'text-text-primary'}`}>
                  {nextSlide.title || nextSlide.ref}
                </h4>
                <p className={`text-[11px] line-clamp-2 mt-0.5 ${isLight ? 'text-[#4B5563]' : 'text-[#9B9CA3]'}`}>
                  {nextSlide.content || nextSlide.text}
                </p>
              </>
            ) : (
              <p className={`text-[11px] italic ${isLight ? 'text-[#9CA3AF]' : 'text-[#6B6C73]'}`}>
                No next slide staged
              </p>
            )}
            {(nextSlide?.mediaName || nextSlide?.mediaUrl || nextSlide?.mediaType === 'youtube' || nextSlide?.type === 'YouTube Video') && (
              <MediaThumb
                type={nextSlide.mediaType || (nextSlide.type === 'YouTube Video' ? 'youtube' : 'image')}
                name={nextSlide.mediaName}
                url={nextSlide.mediaUrl}
                youtubeId={nextSlide.youtubeId}
                fit={nextSlide.mediaFit}
              />
            )}
          </div>
        </div>
      </div>

      {/* TRANSPORT & OVERLAY CONTROL BAR */}
      <div className="space-y-2 pt-3 border-t border-[#2A2C31]">
          {/* Present Next Verse (single click: next + present) */}
          <button
            onClick={handleTransportPresentNext}
            disabled={presentNextDisabled}
            className="w-full py-3 bg-accent hover:bg-accent/90 text-bg font-bold rounded-lg text-sm flex items-center justify-center gap-2 shadow transition cursor-pointer disabled:opacity-40"
          >
            <Play set="bold" primaryColor="#0B0C0E" size="small" />
            {hymnDeckActive ? 'Present Next Stanza' : 'Present Next'}
          </button>

        {/* Output Screen Theme Quick Selector */}
        {setOutputTheme && (
          <div className="space-y-1">
            <div className={`text-[10px] uppercase font-bold tracking-wider ${isLight ? 'text-[#6B7280]' : 'text-[#9B9CA3]'}`}>
              Output Screen Theme
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setOutputTheme('dark')}
                className={`py-1 rounded text-[10px] font-semibold transition border cursor-pointer ${
                  outputTheme === 'dark'
                    ? 'bg-accent text-bg border-accent'
                    : isLight
                    ? 'bg-[#E5E7EB] text-[#374151] border-[#D1D5DB] hover:bg-[#D1D5DB]'
                    : 'bg-[#24262B] text-[#9B9CA3] border-[#2A2C31] hover:text-text-primary'
                }`}
              >
                Dark
              </button>
              <button
                onClick={() => setOutputTheme('light')}
                className={`py-1 rounded text-[10px] font-semibold transition border cursor-pointer ${
                  outputTheme === 'light'
                    ? 'bg-accent text-bg border-accent'
                    : isLight
                    ? 'bg-[#E5E7EB] text-[#374151] border-[#D1D5DB] hover:bg-[#D1D5DB]'
                    : 'bg-[#24262B] text-[#9B9CA3] border-[#2A2C31] hover:text-text-primary'
                }`}
              >
                Light
              </button>
              <button
                onClick={() => setOutputTheme('image')}
                className={`py-1 rounded text-[10px] font-semibold transition border cursor-pointer ${
                  outputTheme === 'image'
                    ? 'bg-accent text-bg border-accent'
                    : isLight
                    ? 'bg-[#E5E7EB] text-[#374151] border-[#D1D5DB] hover:bg-[#D1D5DB]'
                    : 'bg-[#24262B] text-[#9B9CA3] border-[#2A2C31] hover:text-text-primary'
                }`}
              >
                Image
              </button>
              <button
                onClick={() => setOutputTheme('video')}
                className={`py-1 rounded text-[10px] font-semibold transition border cursor-pointer ${
                  outputTheme === 'video'
                    ? 'bg-accent text-bg border-accent'
                    : isLight
                    ? 'bg-[#E5E7EB] text-[#374151] border-[#D1D5DB] hover:bg-[#D1D5DB]'
                    : 'bg-[#24262B] text-[#9B9CA3] border-[#2A2C31] hover:text-text-primary'
                }`}
              >
                Video
              </button>
            </div>
          </div>
        )}

        {/* Projector text size. Kept here and not only in Settings because the
            operator needs it mid-service: a verse that reads fine at the desk can
            be unreadable from the third pew. Ctrl+[ / Ctrl+] do the same from
            the keyboard. */}
        <div className="space-y-1">
          <div
            className={`text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 ${isLight ? 'text-[#6B7280]' : 'text-[#9B9CA3]'}`}
          >
            <FaTextHeight size={14} /> Projector Text Size
          </div>
          <FontScaleSlider
            id="rail-projector-text-size"
            value={outputFontSize}
            onChange={setOutputFontSize}
            showTicks={false}
            className={`rounded border px-2 py-1.5 ${isLight ? 'bg-[#F9FAFB] border-[#E5E7EB]' : 'bg-[#1C1D21] border-[#2A2C31]'}`}
          />
        </div>

        {/* Multi-Display Projection Targets */}
        <div className="space-y-1">
          <div className={`text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 ${isLight ? 'text-[#6B7280]' : 'text-[#9B9CA3]'}`}>
            <FaDisplay set="bold" primaryColor="#D4A94A" size="14" /> Projection Displays
          </div>
          {displays.length > 1 ? (
            <div className="space-y-1">
              {displays.map((d, i) => {
                const isPrimary = d.isPrimary || i === 0
                const isSelected = projectionDisplays.includes(Number(d.id))
                return (
                  <button
                    key={d.id || i}
                    type="button"
                    disabled={isPrimary || !setProjectionDisplays}
                    onClick={() => {
                      if (isPrimary || !setProjectionDisplays) return
                      const numericId = Number(d.id)
                      setProjectionDisplays((prev) =>
                        isSelected
                          ? (prev || []).filter((id) => id !== numericId)
                          : [...(prev || []), numericId]
                      )
                    }}
                    title={isPrimary ? 'Control display (always the main window)' : isSelected ? 'Projecting here â€” click to remove' : 'Click to project here'}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded border text-[10px] transition ${
                      isPrimary
                        ? 'opacity-60 cursor-not-allowed'
                        : 'cursor-pointer'
                    } ${
                      isSelected
                        ? 'bg-accent/15 border-accent text-accent'
                        : isLight
                        ? 'bg-[#E5E7EB] border-[#D1D5DB] text-[#4B5563] hover:bg-[#D1D5DB] hover:text-[#111827]'
                        : 'bg-[#24262B] border-[#2A2C31] text-[#9B9CA3] hover:text-text-primary'
                    }`}
                  >
                    <span className="truncate font-semibold">
                      {isPrimary ? 'Main Display' : `${d.label || `Display ${i + 1}`}`}
                    </span>
                    <span className={`flex items-center gap-1 font-bold ${isSelected ? 'text-accent' : isLight ? 'text-[#9CA3AF]' : 'text-[#6B6C73]'}`}>
                      {isPrimary ? (
                        <FaLock/>
                      ) : isSelected ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> <FaLockOpen/>
                        </>
                      ) : (
                        <FaLock/>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className={`text-[10px] italic px-1 ${isLight ? 'text-[#9CA3AF]' : 'text-[#6B6C73]'}`}>
              Only the main display is detected. Connect a second monitor to project.
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={isLive ? (handleTransportPresentPrev || handleTransportPrev) : handleTransportPrev}
            disabled={prevDisabled}
            className={`py-2 border rounded font-semibold text-[11px] flex items-center justify-center gap-1 transition disabled:opacity-40 cursor-pointer ${
              isLight
                ? 'bg-[#E5E7EB] hover:bg-[#D1D5DB] border-[#D1D5DB] text-[#111827]'
                : 'bg-[#24262B] hover:bg-[#2A2C31] border-[#2A2C31] text-text-primary'
            }`}
          >
            <ArrowLeft set="light" primaryColor="currentColor" size="small" /> Prev
          </button>
          <button
            onClick={isLive ? handleTransportPresentNext : handleTransportNext}
            disabled={nextDisabled}
            className={`py-2 border rounded font-semibold text-[11px] flex items-center justify-center gap-1 transition disabled:opacity-40 cursor-pointer ${
              isLight
                ? 'bg-[#E5E7EB] hover:bg-[#D1D5DB] border-[#D1D5DB] text-[#111827]'
                : 'bg-[#24262B] hover:bg-[#2A2C31] border-[#2A2C31] text-text-primary'
            }`}
          >
            Next <ArrowRight set="light" primaryColor="currentColor" size="small" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={handleToggleClear}
            className={`py-1.5 border rounded text-[11px] font-medium flex items-center justify-center gap-1 transition cursor-pointer ${
              isBlank
                ? 'bg-accent/20 border-accent text-accent'
                : isLight
                ? 'bg-[#E5E7EB] hover:bg-[#D1D5DB] border-[#D1D5DB] text-[#111827]'
                : 'bg-[#24262B] hover:bg-[#2A2C31] border-[#2A2C31] text-text-primary'
            }`}
          >
            <FaEraser set="light" primaryColor="currentColor" size="16" /> Clear
          </button>
          <button
            onClick={handleToggleBlack}
            className={`py-1.5 border rounded text-[11px] font-medium flex items-center justify-center gap-1 transition cursor-pointer ${
              isBlack
                ? 'bg-live/20 border-live text-live'
                : isLight
                ? 'bg-[#E5E7EB] hover:bg-[#D1D5DB] border-[#D1D5DB] text-[#111827]'
                : 'bg-[#24262B] hover:bg-[#2A2C31] border-[#2A2C31] text-text-primary'
            }`}
          >
            <FaEyeSlash set="light" primaryColor="currentColor" size="16" /> Black
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={handleTransportPresent}
            className="py-2 bg-accent hover:bg-accent/90 text-bg font-bold rounded text-[11px] flex items-center justify-center gap-1 shadow transition cursor-pointer"
          >
            <Play set="bold" primaryColor="#0B0C0E" size="small" /> Present
          </button>
          <button
            onClick={handleTransportStop}
            disabled={!isLive}
            className={`py-2 border font-semibold rounded text-[11px] flex items-center justify-center gap-1.5 transition disabled:opacity-40 cursor-pointer ${
              isLight
                ? 'bg-[#E5E7EB] hover:bg-[#D1D5DB] border-[#D1D5DB] text-live'
                : 'bg-[#24262B] hover:bg-[#2A2C31] border-[#2A2C31] text-live'
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
            <span>Stop</span>
          </button>
        </div>
      </div>
    </aside>
  )
}

