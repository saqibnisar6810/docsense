import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-ink bg-white">
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3 font-mono text-[14px]">
          <span className="bg-ink px-2 py-1 font-medium text-white">DocSense</span>
          <span className="hidden text-mu sm:inline">AI document extraction</span>
        </Link>
        <NavLinks />
        <a
          href="https://github.com/saqibnisar6810/docsense"
          className="ml-auto hidden font-mono text-[13px] text-mu hover:text-ink md:block"
          target="_blank"
          rel="noreferrer"
        >
          Source on GitHub ↗
        </a>
      </div>
    </header>
  );
}
