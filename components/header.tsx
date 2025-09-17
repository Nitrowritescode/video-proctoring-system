import Link from "next/link";
import { Button } from "./ui/button";

export default function Header() {

    return (
        <header className="p-4 md:p-6 container mx-auto">
            <nav className="flex gap-6 rounded-full items-center p-4 mx-auto bg-black text-white/80 max-sm:justify-between">
                {/* Logo */}
                <div className="text-white text-2xl">
                    Video
                    <span className="text-indigo-700 italic">Proctor</span>
                </div>

                {/* navigation items */}
                <div className="mx-auto font-sm gap-6 flex items-center max-sm:hidden">
                    <Link href="/meeting" className="hover:text-gray-200">
                        Meeting
                    </Link>
                    <Link href="/admin/dashboard" className="hover:text-gray-200">
                        Dashboard
                    </Link>
                </div>

                {/* get started button */}
                <Button asChild className="bg-white text-black rounded-full hover:bg-white/60">
                    <Link href="/meeting">
                        Start Meeting
                    </Link>
                </Button>
            </nav>
        </header>
    )
}
