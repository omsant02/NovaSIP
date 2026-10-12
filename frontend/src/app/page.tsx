import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { TwoWorlds } from "@/components/landing/TwoWorlds";
import { Decisions } from "@/components/landing/Decisions";
import { Limits } from "@/components/landing/Limits";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <TwoWorlds />
        <Decisions />
        <Limits />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}