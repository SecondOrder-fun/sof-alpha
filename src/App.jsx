// React import not needed with Vite JSX transform
import { Outlet } from "react-router-dom";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import StickyFooter from "@/components/layout/StickyFooter";
import { Toaster } from "@/components/ui/toaster";
import UsernameDialog from "@/components/user/UsernameDialog";
import { useUsernameContext } from "@/context/UsernameContext";
import { ContractAddressValidator } from "@/components/dev/ContractAddressValidator";

const App = () => {
  const { showDialog, setShowDialog } = useUsernameContext();

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div>
          <Outlet />
        </div>
      </main>
      <Footer />
      <StickyFooter />
      <Toaster />
      <UsernameDialog open={showDialog} onOpenChange={setShowDialog} />
      <ContractAddressValidator />
    </div>
  );
};

export default App;
