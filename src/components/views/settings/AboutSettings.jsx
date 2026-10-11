import React from "react";
import {
  FaCircleInfo,
  FaArrowRotateRight,
  FaDownload,
  FaCircleCheck,
} from "react-icons/fa6";
import appIconDark from "../../../assets/app-icon-dark.png";
import appIconLight from "../../../assets/app-icon-light.png";

export default function AboutSettings({
  cardClass,
  textTitle,
  textSub,
  borderDivider,
  isLight,
}) {
  const [version, setVersion] = React.useState(null);
  const [update, setUpdate] = React.useState({ status: "idle" });
  // Automatic checking is opt-in; the main process owns the real value.
  const [autoCheck, setAutoCheck] = React.useState(false);

  React.useEffect(() => {
    if (window.api?.getAppInfo) {
      window.api
        .getAppInfo()
        .then((info) => setVersion(info?.version ?? null))
        .catch(() => {});
    }
    if (window.api?.getAutoUpdateCheck) {
      window.api
        .getAutoUpdateCheck()
        .then((res) => {
          if (res && typeof res.autoCheck === "boolean") setAutoCheck(res.autoCheck);
        })
        .catch(() => {});
    }
    if (!window.api?.onUpdaterStatus) return;
    const unsubscribe = window.api.onUpdaterStatus((payload) => {
      if (payload && payload.status) setUpdate(payload);
    });
    return typeof unsubscribe === "function" ? unsubscribe : undefined;
  }, []);

  const onToggleAutoCheck = async (next) => {
    setAutoCheck(next);
    if (!window.api?.setAutoUpdateCheck) return;
    const res = await window.api.setAutoUpdateCheck(next).catch(() => null);
    if (res && typeof res.autoCheck === "boolean") setAutoCheck(res.autoCheck);
  };

  const onCheck = async () => {
    if (!window.api?.checkForUpdates) return;
    setUpdate({ status: "checking" });
    const res = await window.api.checkForUpdates().catch(() => null);
    if (res && res.ok === false) {
      setUpdate({ status: "error", message: res.message });
    }
  };

  const status = update.status;
  const isBusy = status === "checking" || status === "downloading";
  const primaryBtn = "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0D3822] text-[#34D399] border border-[#10B981]/30 text-xs font-semibold hover:bg-[#10462D]";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-sm font-bold text-accent flex items-center gap-2">
          <FaCircleInfo /> About &amp; Updates
        </h3>
        <p className={`text-xs mt-1 ${textSub}`}>
          WordDesk — offline-first church presentation. Check for updates and
          install a new version without leaving the app.
        </p>
      </div>

      <div className={`space-y-4 pt-2 border-t ${borderDivider}`}>
        <div className={`p-4 rounded border ${cardClass} space-y-3`}>
          <div className="flex items-center gap-3">
            <img
              src={appIconLight}
              alt="WordDesk Logo"
              className="w-7 h-7 object-contain rounded-md drop-shadow-sm"
            />
            <span className="bg-[#0D3822] text-[#34D399] border border-[#10B981]/30 rounded-lg px-3 py-1 font-semibold text-xs">
              {version ? `WordDesk v${version}` : "WordDesk"}
            </span>
            <span className={`text-xs ${textSub}`}>
              100% offline &middot; no account needed
            </span>
          </div>

          {/* Software Updates — kept directly under the version so the check
              button is visible without scrolling. */}
          <div className="space-y-3 pt-1">
            <h2 className={`text-sm font-bold ${textTitle}`}>Software Updates</h2>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onCheck}
                disabled={isBusy}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
                  isLight
                    ? "border-[#D1D5DB] text-[#111827] hover:bg-[#F3F4F6]"
                    : "border-current/10 hover:bg-white/5"
                }`}
              >
                <FaArrowRotateRight
                  className={status === "checking" ? "animate-spin" : ""}
                />
                Check for updates
              </button>

              {status === "available" && !update.manualOnly && (
                <button
                  onClick={() => window.api?.downloadUpdate?.()}
                  className={primaryBtn}
                >
                  <FaDownload /> Download v{update.version}
                </button>
              )}

              {status === "downloaded" && !update.manualOnly && (
                <button
                  onClick={() => window.api?.installUpdate?.()}
                  className={primaryBtn}
                >
                  <FaCircleCheck /> Restart &amp; install
                </button>
              )}

              {(status === "available" || status === "downloaded") &&
                update.manualOnly && (
                  <button
                    onClick={() => window.api?.openReleasesPage?.()}
                    className={primaryBtn}
                  >
                    <FaDownload /> Open downloads page
                  </button>
                )}
            </div>

            <p className={`text-xs ${textSub} min-h-4`}>
              {status === "idle" &&
                (autoCheck
                  ? "WordDesk checks for a new version shortly after startup and every 6 hours. Nothing is ever downloaded without your say-so."
                  : "Automatic checking is off. Use the button above whenever you want to look for a new version.")}
              {status === "checking" && "Checking for updates…"}
              {status === "up-to-date" &&
                `WordDesk ${update.version ?? version ?? ""} is up to date.`}
              {status === "available" &&
                (update.manualOnly
                  ? `Version ${update.version} is available. macOS builds are not code-signed, so download it from the releases page.`
                  : `Version ${update.version} is available.`)}
              {status === "downloading" && `Downloading ${update.percent ?? 0}%…`}
              {status === "downloaded" &&
                (update.manualOnly
                  ? `Version ${update.version} downloaded. Install it from the releases page.`
                  : "Update ready. Restart to install — or just quit normally and it will install.")}
              {status === "error" &&
                (update.message || "Could not check for updates.")}
            </p>

            {/* Automatic check toggle */}
            <label
              className={`flex items-center gap-3 pt-1 cursor-pointer select-none ${
                status === "checking" || status === "downloading"
                  ? "opacity-60"
                  : ""
              }`}
            >
              <button
                type="button"
                role="switch"
                aria-checked={autoCheck}
                aria-label="Automatically check for updates"
                onClick={() =>
                  onToggleAutoCheck(!autoCheck).catch(() => {})
                }
                className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                  autoCheck ? "bg-[#10B981]" : "bg-[#9CA3AF]"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                    autoCheck ? "left-4.5" : "left-0.5"
                  }`}
                />
              </button>
              <span className="text-xs">
                <span className={`font-semibold ${textTitle}`}>
                  Automatically check for updates
                </span>
                <span className={`block ${textSub}`}>
                  Off by default, so the app never touches the network on its
                  own. When on, it only looks for a new version — you still
                  choose whether to download and install it.
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-3 pt-4 border-t border-current/10">
            <h2 className={`text-sm font-bold ${textTitle}`}>
              What&apos;s new in this version
            </h2>

            <ul
              className={`space-y-3 text-xs ${textSub} list-disc list-inside leading-relaxed pl-1 max-w-2xl`}
            >
              <li>
                <span className={`font-semibold ${textTitle}`}>
                  Sequential Verse &amp; Hymn Progression
                </span>
                . Presenting scripture or hymns from your service plan now seamlessly prepares and advances to the next verse (e.g. Matthew 3:16 → 17 → 18) or hymn stanza.
              </li>
              <li>
                <span className={`font-semibold ${textTitle}`}>
                  Seamless Auto-Updates &amp; Legacy Migration
                </span>
                . Updates install silently and reliably without modal interruptions, and legacy shortcuts and data from previous versions migrate automatically.
              </li>
              <li>
                <span className={`font-semibold ${textTitle}`}>
                  Draggable Service Plan Order
                </span>
                . Rearrange service schedule items seamlessly with drag-and-drop handles and responsive visual drop targets.
              </li>
              <li>
                <span className={`font-semibold ${textTitle}`}>
                  YouTube &amp; Online Media Slides
                </span>
                . Paste any YouTube video link or web image directly into your service plan to stream videos and display photos on air with thumbnail previews.
              </li>
              <li>
                <span className={`font-semibold ${textTitle}`}>
                  Non-Blocking Notifications &amp; Input Stability
                </span>
                . Replaced modal dialog alerts with native in-app Sonner toasts, eliminating input and search bar freeze issues when saving or loading playlists.
              </li>
              <li>
                <span className={`font-semibold ${textTitle}`}>
                  Documents Default Directory
                </span>
                . Service plan saving and opening dialogs now default cleanly to your system Documents folder.
              </li>
              <li>
                <span className={`font-semibold ${textTitle}`}>
                  WordDesk Header Branding
                </span>
                . Standardized presentation header branding to WordDesk with automatic configuration migration.
              </li>
              <li>
                <span className={`font-semibold ${textTitle}`}>
                  Continuous Font Size Scaling &amp; Offline Core
                </span>
                . Smooth free-sliding scale between 75% and 200% with complete offline resilience for local Bibles and hymnals.
              </li>
            </ul>
          </div>

          <div className="pt-4 text-center border-t border-current/10">
            <p className={`text-xs ${textSub}`}>
              © 2026 WordDesk. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
