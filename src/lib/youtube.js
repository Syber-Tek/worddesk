/**
 * Extracts an 11-character YouTube video ID from various YouTube URL formats or raw IDs.
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://www.youtube.com/watch?feature=shared&v=VIDEO_ID&t=10s
 * - https://youtu.be/VIDEO_ID?si=...
 * - https://www.youtube.com/live/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - Raw 11-char ID
 */
export function extractYouTubeId(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  const idPattern = /^[a-zA-Z0-9_-]{11}$/;

  try {
    const isFullUrl =
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.includes("youtube.com") ||
      trimmed.includes("youtu.be");
    if (isFullUrl) {
      const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      const isYoutubeHost =
        parsed.hostname.includes("youtube.com") ||
        parsed.hostname.includes("youtu.be");
      if (isYoutubeHost) {
        const vParam = parsed.searchParams.get("v");
        if (vParam && idPattern.test(vParam)) {
          return vParam;
        }
        const pathnameParts = parsed.pathname.split("/").filter(Boolean);
        if (parsed.hostname.includes("youtu.be") && pathnameParts.length > 0) {
          if (idPattern.test(pathnameParts[0])) return pathnameParts[0];
        }
        const lastPart = pathnameParts[pathnameParts.length - 1];
        if (lastPart && idPattern.test(lastPart)) {
          return lastPart;
        }
      }
    }
  } catch {
    // ignore parse errors and fall through
  }

  // If passed directly as an 11-character video ID (not a URL with slashes)
  if (!trimmed.includes("/") && !trimmed.includes(" ") && idPattern.test(trimmed)) {
    return trimmed;
  }

  const pattern = /(?:youtu\.be\/|youtube\.com\/(?:v\/|u\/\w\/|embed\/|shorts\/|live\/|watch\?v=)|[?&]v=)([^#&?/\s]+)/;
  const match = trimmed.match(pattern);
  if (match && match[1] && idPattern.test(match[1])) {
    return match[1];
  }
  return null;
}
