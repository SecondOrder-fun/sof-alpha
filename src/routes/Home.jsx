// src/routes/Home.jsx

import { useTranslation } from "react-i18next";
import MeltyLines from "@/components/backgrounds/MeltyLines";

const Home = () => {
  const { t } = useTranslation("common");

  return (
    <div className="relative">
      {/* Animated Melty Lines Background */}
      <MeltyLines />

      {/* Content Panel - centered with transparent background */}
      <div className="relative z-10 flex items-center justify-center min-h-[45vh]">
        <div
          className="w-full max-w-4xl mx-auto px-8 py-12 rounded-lg text-center"
          style={{ backgroundColor: "rgba(128, 128, 128, 0.1)" }}
        >
          <h1 className="text-2xl font-semibold mb-4">{t("home.welcome")}</h1>
          <p className="text-muted-foreground leading-relaxed">
            {t("home.blurb")}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Home;
