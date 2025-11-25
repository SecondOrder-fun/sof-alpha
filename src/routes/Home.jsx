// src/routes/Home.jsx

import { useTranslation } from "react-i18next";

const Home = () => {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("home.welcome")}</h1>
      <p className="text-muted-foreground">{t("home.blurb")}</p>
    </div>
  );
};

export default Home;
