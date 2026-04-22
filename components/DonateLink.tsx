import { DONATE_URL } from "@/lib/donate";

/**
 * Fixed bottom-right "Support" pill. Purely informational outbound link — no
 * payment flow runs inside the app, so Permissions-Policy payment=() still
 * holds. rel="noopener noreferrer" prevents window.opener access and strips
 * the Referer header (defence in depth over the page-level Referrer-Policy).
 */
export default function DonateLink() {
  return (
    <a
      href={DONATE_URL}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      aria-label="Support this project via PayPal (opens in a new tab)"
      className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-200 shadow-lg backdrop-blur hover:border-violet-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
    >
      <span aria-hidden className="text-rose-400">♥</span>
      <span>Support</span>
    </a>
  );
}
