import Link from "next/link";

const Footer = () => {
    return (
        <footer className="border-t mt-24 py-8 border-black bg-slate-700">
            <div className="container mx-auto">
                <div className="text-black text-2xl md:text-4xl lg:text-5xl font-bold size-full flex justify-center items-center">
                    Video<span className="text-indigo-500 italic">Proctor</span>
                </div>

                <nav className="flex text-sm font-medium items-center justify-center gap-4 py-6">
                
                    <Link href="/room" className="hover:text-gray-300">
                        Meeting
                    </Link>
                    <Link href="/dashboard" className="hover:text-gray-300">
                        Dashboard
                    </Link>
                </nav>
            </div>
            <div className="flex justify-center items-center pt-8">
                <p>
                    Made with ❤️ for assignment
                </p>
            </div>

        </footer >
    )
}

export default Footer;