interface InfoHintProps {
  label: string;
}

export default function InfoHint({ label }: InfoHintProps) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-600 text-[10px] font-semibold text-zinc-400"
    >
      ?
    </span>
  );
}
