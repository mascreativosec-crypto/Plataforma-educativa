import React from 'react';
import { ExternalLink, Film, Volume2 } from 'lucide-react';
import { parseQuestionMediaUrl } from '../../lib/media-embed';

interface QuestionMediaPlayerProps {
  audioUrl?: string | null;
  videoUrl?: string | null;
  compact?: boolean;
}

export function QuestionMediaPlayer({
  audioUrl,
  videoUrl,
  compact = false,
}: QuestionMediaPlayerProps) {
  const parsedAudio = audioUrl?.trim() ? parseQuestionMediaUrl(audioUrl, 'audio') : null;
  const parsedVideo = videoUrl?.trim() ? parseQuestionMediaUrl(videoUrl, 'video') : null;

  const hasAudio = Boolean(parsedAudio && parsedAudio.valid);
  const hasVideo = Boolean(parsedVideo && parsedVideo.valid);

  if (!hasAudio && !hasVideo) return null;

  return (
    <div className="space-y-3" data-testid="question-media-player">
      {hasAudio && parsedAudio && (
        <div className="p-3.5 rounded-xl bg-[#f5f6f8] border border-[#d9d9d9] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#011f52]">
              <Volume2 className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
              <span>Audio de la pregunta</span>
              <span className="text-[11px] font-normal text-slate-500">
                · {parsedAudio.providerLabel}
              </span>
            </span>
            <a
              href={parsedAudio.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#011f52] hover:text-[#cf080d]"
            >
              <span>Abrir enlace</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>

          {parsedAudio.renderMode === 'iframe' ? (
            <iframe
              src={parsedAudio.src}
              title="Reproductor de audio de la pregunta"
              allow="autoplay"
              className="w-full h-20 rounded-lg border border-[#d9d9d9] bg-white"
            />
          ) : (
            <audio
              controls
              preload="metadata"
              src={parsedAudio.src}
              className="w-full h-10"
              aria-label="Audio de la pregunta"
            />
          )}
        </div>
      )}

      {hasVideo && parsedVideo && (
        <div className="p-3.5 rounded-xl bg-[#f5f6f8] border border-[#d9d9d9] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#011f52]">
              <Film className="w-4 h-4 text-[#cf080d]" aria-hidden="true" />
              <span>Video de la pregunta</span>
              <span className="text-[11px] font-normal text-slate-500">
                · {parsedVideo.providerLabel}
              </span>
            </span>
            <a
              href={parsedVideo.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#011f52] hover:text-[#cf080d]"
            >
              <span>Abrir en nueva pestaña</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>

          {parsedVideo.renderMode === 'iframe' ? (
            <div
              className={`relative w-full overflow-hidden rounded-xl border border-[#d9d9d9] bg-black ${
                compact ? 'aspect-video max-h-64' : 'aspect-video'
              }`}
            >
              <iframe
                src={parsedVideo.src}
                title="Reproductor de video de la pregunta"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
          ) : (
            <video
              controls
              preload="metadata"
              src={parsedVideo.src}
              className={`w-full rounded-xl bg-black border border-[#d9d9d9] ${
                compact ? 'max-h-60' : 'max-h-80'
              }`}
            />
          )}
        </div>
      )}
    </div>
  );
}
