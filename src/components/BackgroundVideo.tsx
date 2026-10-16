import React, { useEffect, useRef, useState } from 'react';
import type { VideoSource } from '../types/adas';

interface BackgroundVideoProps {
  source: VideoSource;
  onVideoElementReady?: (el: HTMLVideoElement | null) => void;
  isDanger: boolean;
}

export const BackgroundVideo: React.FC<BackgroundVideoProps> = ({
  source,
  onVideoElementReady,
  isDanger,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [prevSourceUrl, setPrevSourceUrl] = useState(source.url);

  if (prevSourceUrl !== source.url) {
    setPrevSourceUrl(source.url);
    setLoadError(false);
  }

  useEffect(() => {
    if (source.type === 'mp4' && videoRef.current) {
      onVideoElementReady?.(videoRef.current);
    } else {
      onVideoElementReady?.(null);
    }
  }, [source, onVideoElementReady]);

  // Extract youtube ID from link or raw ID
  const getYouTubeId = (urlOrId: string): string => {
    if (!urlOrId) return 'mU4PjQJ92Xo';
    const trimmed = urlOrId.trim();
    if (trimmed.length === 11 && !trimmed.includes('/') && !trimmed.includes('?')) {
      return trimmed;
    }
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : trimmed;
  };

  const videoId = source.id || getYouTubeId(source.url);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden bg-black select-none pointer-events-none">
      {source.type === 'youtube' ? (
        <div className="relative w-full h-full pointer-events-auto">
          <iframe
            key={videoId}
            className="w-full h-full border-0 scale-105 pointer-events-auto"
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&playsinline=1&rel=0&modestbranding=1&disablekb=1&fs=0`}
            title="Dashcam Video Feed"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <video
          ref={videoRef}
          src={source.url}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          onError={() => setLoadError(true)}
        />
      )}

      {/* Subtle vignette shadow around screen edges for true HUD cockpit feeling */}
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_120px_rgba(0,0,0,0.85)]" />

      {/* Danger Red Vignette Pulse when distance < 12m */}
      {isDanger && (
        <div className="absolute inset-0 pointer-events-none danger-vignette border-4 border-red-500/80 transition-all duration-200 z-10" />
      )}

      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white p-6 z-20 pointer-events-auto">
          <div className="text-center max-w-md">
            <p className="text-red-400 font-semibold mb-2">Không thể tải video MP4</p>
            <p className="text-sm text-gray-400">Vui lòng thử chọn file video khác hoặc chuyển sang link YouTube.</p>
          </div>
        </div>
      )}
    </div>
  );
};
