// src/routes/CreateSeasonPage.jsx
// Desktop route for /create-season — thin wrapper around CreateSeasonWorkflow.
import { useTranslation } from "react-i18next";
import { CreateSeasonWorkflow } from "@/components/sponsor/CreateSeasonWorkflow";

const CreateSeasonPage = () => {
  const { t } = useTranslation("raffle");

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t("createSeasonPageTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("createSeasonPageDesc")}
        </p>
      </div>
      <CreateSeasonWorkflow />
    </div>
  );
};

export default CreateSeasonPage;
