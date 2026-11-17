import { Button } from "@watchalong/ui/components/ui/button";
import { Skeleton } from "@watchalong/ui/components/ui/skeleton";
import { Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStageGeometry } from "../hooks/useStageGeometry";
import type { GuestSession, GuestState } from "../session/guest-session";
import { InputLayer } from "./InputLayer";

interface StageProps {
  session: GuestSession;
  state: GuestState;
  drawing: boolean;
  onNoControl: () => void;
}

export function Stage({ session, state, drawing, onNoControl }: StageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [hasFrames, setHasFrames] = useState(false);
  const rect = useStageGeometry(stageRef, videoRef, state.viewport);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let current = true;
    video.srcObject = state.stream;
    if (!state.stream) {
      setHasFrames(false);
      return;
    }
    video.muted = false;
    video
      .play()
      .then(() => {
        if (current) setNeedsUnmute(false);
      })
      .catch((err: unknown) => {
        // Ignore aborted requests from a stream that was replaced; only a real autoplay
        // block (NotAllowedError) should mute and show the sound prompt.
        if (!current || (err instanceof DOMException && err.name !== "NotAllowedError")) return;
        video.muted = true;
        setNeedsUnmute(true);
        video.play().catch(() => {});
      });
    return () => {
      current = false;
    };
  }, [state.stream]);

  const unmute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.play().catch(() => {});
    setNeedsUnmute(false);
  };

  return (
    <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden" data-testid="stage">
      <video
        ref={videoRef}
        className="absolute inset-0 size-full object-contain"
        playsInline
        autoPlay
        data-testid="stream"
        onLoadedData={() => setHasFrames(true)}
      />
      {!hasFrames && <StreamPlaceholder failed={state.peer === "failed"} />}
      {rect && hasFrames && (
        <InputLayer
          rect={rect}
          viewport={state.viewport}
          color={state.me?.color ?? "#4dabf7"}
          drawing={drawing}
          canControl={!!state.me?.canControl}
          send={(m) => session.send(m)}
          onNoControl={onNoControl}
        />
      )}
      {needsUnmute && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center">
          <Button size="lg" onClick={unmute} className="shadow-xl shadow-black/50">
            <Volume2 />
            Click to turn on sound
          </Button>
        </div>
      )}
    </div>
  );
}

function StreamPlaceholder({ failed }: { failed: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-8">
      <div className="flex w-full max-w-3xl flex-col items-center gap-4">
        <Skeleton className="aspect-video w-full rounded-xl bg-muted/40" />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {failed
            ? "Couldn't connect to the host. Their network may be blocking it."
            : "Connecting to the host's tab…"}
        </p>
      </div>
    </div>
  );
}
