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
      className="fixed bottom-4 right-4 z-40 hidden items-center gap-2 rounded-full border border-fuchsia-400/60 bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-xl shadow-fuchsia-500/25 transition hover:scale-[1.02] hover:from-violet-400 hover:to-fuchsia-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 sm:inline-flex"
      title="Support this project via PayPal"
    >
      <span aria-hidden>♥</span>
      <span>Support This Project</span>
    </a>
  );
}
