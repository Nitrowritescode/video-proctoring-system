import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image"

export default function Home() {
  return (
    <div className="bg-background text-foreground grid grid-cols-1 lg:grid-cols-2 container mx-auto">
      {/* hero section */}
      <div className="flex flex-col gap-2 justify-center items-center">
        {/* hero heading */}
        <h1 className="text-2xl md:text-5xl text-blue-600 font-bold">
          Video Proctoring System
        </h1>
        <p className="text-xl md:text-2xl font-medium text-muted-foreground">Focus & Object Detection in Video Interviews </p>

        {/* Get Started Buttons */}
        <div className="flex justify-center items-center gap-4 py-4">
          <Button className="bg-indigo-800 hover:bg-indigo-950" asChild>
            <Link href="/meeting" >
              Get Started
            </Link>
          </Button>
          <Button asChild variant="default">
            <Link href="/admin/dashboard" >
              Dashboard
            </Link>
          </Button>
        </div>

        {/* hero preview image*/}
      </div>
        <div className="container max-w-4xl mx-auto flex justify-center">
          <Image src={'/hero.webp'} width={500} height={500} alt="hero image"/>
        </div>
    </div>
  );
}
