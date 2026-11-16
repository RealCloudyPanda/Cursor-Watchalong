import { type Rect, sharedContentRect } from "@watchalong/protocol";
import { type RefObject, useEffect, useState } from "react";

/**
 * The rectangle (relative to the stage element) where the host's tab viewport is drawn.
 * Pointer positions are normalized against this so they land on the same spot in the host tab.
 */
export function useStageGeometry(
  stageRef: RefObject<HTMLElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
  viewport: { width: number; height: number } | null,
): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const video = videoRef.current;
    if (!stage || !video) return;

    const update = () => {
      const box = stage.getBoundingClientRect();
      if (!video.videoWidth || !video.videoHeight) {
        setRect(null);
        return;
      }
      const next = sharedContentRect(
        { width: box.width, height: box.height },
        { width: video.videoWidth, height: video.videoHeight },
        viewport,
      );
      setRect((prev) =>
        prev &&
        Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.top - next.top) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5 &&
        Math.abs(prev.height - next.height) < 0.5
          ? prev
          : next,
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(stage);
    video.addEventListener("resize", update);
    video.addEventListener("loadedmetadata", update);
    return () => {
      ro.disconnect();
      video.removeEventListener("resize", update);
      video.removeEventListener("loadedmetadata", update);
    };
  }, [stageRef, videoRef, viewport]);

  return rect;
}
