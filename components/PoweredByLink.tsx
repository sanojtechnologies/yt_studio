export const POWERED_BY_URL = "https://sanojtechnologies.com/";

export default function PoweredByLink() {
  return (
    <a
      href={POWERED_BY_URL}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      aria-label="Powered By Sanoj Technologies (opens in a new tab)"
      title="Powered By Sanoj Technologies"
      className="fixed bottom-4 left-4 z-40 hidden items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900/85 px-3 py-1.5 text-xs font-medium text-zinc-200 shadow-lg backdrop-blur transition hover:border-violet-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:inline-flex"
    >
      <span className="text-zinc-400">Powered By:</span>
      <span className="text-violet-300">Sanoj Technologies</span>
    </a>
  );
}
