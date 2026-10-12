import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Nav } from "@/components/landing/Nav";
import { Strategies } from "@/components/landing/Strategies";
import { TwoWorlds } from "@/components/landing/TwoWorlds";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <TwoWorlds />
      <HowItWorks />
      <Strategies />
    </main>
  );
}