import Link from "next/link";

export function Footer() {
  return (
    <p className="footer">
      <Link href="/privacy">Privacy</Link>
      <Link href="/terms">Terms</Link>
      <Link href="/contact">Contact</Link>
    </p>
  );
}
