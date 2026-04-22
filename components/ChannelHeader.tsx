import Image from "next/image";
import { ReactNode } from "react";
import { YouTubeChannel } from "@/types/youtube";

interface ChannelHeaderProps {
  channel: YouTubeChannel;
  actions?: ReactNode;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

export default function ChannelHeader({ channel, actions }: ChannelHeaderProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {channel.thumbnailUrl ? (
            <Image
              src={channel.thumbnailUrl}
              alt={channel.title}
              width={64}
              height={64}
              className="size-16 rounded-full border border-zinc-700 object-cover"
            />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs text-zinc-400">
              No image
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">{channel.title}</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {formatNumber(channel.subscriberCount)} subscribers
            </p>
            <p className="text-sm text-zinc-400">
              {formatNumber(channel.viewCount)} total views
            </p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
