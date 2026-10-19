"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Documents", match: (p: string) => p === "/" || p.startsWith("/documents") },
  { href: "/developers", label: "API & webhooks", match: (p: string) => p.startsWith("/developers") },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex h-full items-stretch gap-1 sm:gap-4">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`flex items-center border-b-[3px] px-1 pt-[3px] text-[14px] font-medium ${l.match(path) ? "border-blue text-ink" : "border-transparent text-mu hover:text-ink"}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
