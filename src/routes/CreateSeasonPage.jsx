// src/routes/CreateSeasonPage.jsx
// Desktop route for /create-season — thin wrapper around CreateSeasonWorkflow.
import { CreateSeasonWorkflow } from "@/components/sponsor/CreateSeasonWorkflow";

const CreateSeasonPage = () => {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Create a Raffle Season</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Stake to become a sponsor, then configure and launch your raffle.
        </p>
      </div>
      <CreateSeasonWorkflow />
    </div>
  );
};

export default CreateSeasonPage;
