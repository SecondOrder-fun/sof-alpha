// src/components/mobile/SystemMenu.jsx
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAccount, useDisconnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Globe, Wallet, LogOut, User, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PropTypes from "prop-types";

/**
 * SystemMenu - Pull-down menu from header with account and language settings
 */
const SystemMenu = ({ isOpen, onClose, profile }) => {
  const { t, i18n } = useTranslation(["account", "common", "navigation"]);
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language);

  // Update selected language when i18n language changes
  useEffect(() => {
    setSelectedLanguage(i18n.language);
  }, [i18n.language]);

  // Available languages with emoji flags
  const languages = [
    { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
    { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
    { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
    { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳" },
    { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
    { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
    { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
    { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
    { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇵🇹" },
    { code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺" },
  ];

  // Update selected language when i18n language changes
  useEffect(() => {
    setSelectedLanguage(i18n.language);
  }, [i18n.language]);

  // Handle language change
  const handleLanguageChange = (languageCode) => {
    setSelectedLanguage(languageCode);
    i18n.changeLanguage(languageCode);
  };

  // Handle wallet disconnect
  const handleDisconnect = () => {
    disconnect();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 pointer-events-auto"
        onClick={onClose}
      />

      {/* Menu Container - drops down from below header */}
      <div
        className={`absolute top-16 left-0 right-0 bg-[#130013] border-b border-[#6b6b6b]/20 shadow-lg transform transition-transform duration-300 ease-out pointer-events-auto ${
          isOpen ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        {/* Menu Header */}
        <div className="px-4 py-3 border-b border-[#6b6b6b]/20">
          <h2 className="text-white font-medium">{t("account:systemMenu")}</h2>
        </div>

        {/* Menu Content */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto overflow-x-visible">
          {/* Account Section */}
          <Card className="border-[#353e34] bg-[#1a1a1a]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                {isConnected && profile ? (
                  <div className="w-12 h-12 border-2 border-[#c82a54] rounded-full overflow-hidden bg-[#1a1a1a] flex items-center justify-center">
                    {profile.pfpUrl ? (
                      <img
                        src={profile.pfpUrl}
                        alt={profile.displayName || t("account:username")}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-5 h-5 text-[#a89e99]" />
                    )}
                  </div>
                ) : (
                  <div className="w-12 h-12 border-2 border-[#353e34] rounded-full overflow-hidden bg-[#2a2a2a] flex items-center justify-center">
                    <User className="w-6 h-6 text-[#6b6b6b]" />
                  </div>
                )}
                <div>
                  <div className="text-white font-medium">
                    {profile?.displayName || t("account:notSet")}
                  </div>
                  <div className="text-sm text-[#6b6b6b]">
                    {isConnected
                      ? `${address.slice(0, 6)}...${address.slice(-4)}`
                      : t("account:noAccountLinked")}
                  </div>
                </div>
              </div>

              {/* Wallet Connection */}
              <div className="space-y-2">
                {isConnected ? (
                  <Button
                    onClick={handleDisconnect}
                    variant="outline"
                    className="w-full text-white border-[#353e34] hover:bg-red-500/10 hover:border-red-500"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    {t("account:disconnectWallet")}
                  </Button>
                ) : (
                  <ConnectButton.Custom>
                    {({
                      account,
                      chain,
                      openAccountModal,
                      openChainModal,
                      openConnectModal,
                      authenticationStatus,
                      mounted,
                    }) => {
                      const ready =
                        mounted &&
                        authenticationStatus &&
                        !authenticationStatus.loading;
                      const connected =
                        ready &&
                        account &&
                        chain &&
                        (!authenticationStatus.needsReconnect ||
                          authenticationStatus.needsReconnect);

                      return (
                        <div
                          {...(!ready && {
                            "aria-hidden": true,
                            style: {
                              opacity: 0,
                              pointerEvents: "none",
                              userSelect: "none",
                            },
                          })}
                        >
                          {(() => {
                            if (!connected) {
                              return (
                                <Button
                                  onClick={openConnectModal}
                                  variant="outline"
                                  className="w-full text-white border-[#353e34] hover:bg-white/10"
                                >
                                  <Wallet className="w-4 h-4 mr-2" />
                                  {t("account:connectWallet")}
                                </Button>
                              );
                            }

                            if (chain.unsupported) {
                              return (
                                <Button
                                  onClick={openChainModal}
                                  variant="outline"
                                  className="w-full text-white border-[#353e34] hover:bg-white/10"
                                >
                                  {t("account:wrongNetwork")}
                                </Button>
                              );
                            }

                            return (
                              <div style={{ display: "flex", gap: 12 }}>
                                <Button
                                  onClick={openAccountModal}
                                  variant="outline"
                                  className="w-full text-white border-[#353e34] hover:bg-white/10"
                                >
                                  {account.displayName}
                                  {account.displayBalance
                                    ? ` (${account.displayBalance})`
                                    : ""}
                                </Button>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    }}
                  </ConnectButton.Custom>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Language Settings Section */}
          <Card className="border-[#353e34] bg-[#1a1a1a]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-5 h-5 text-[#c82a54]" />
                <h3 className="text-white font-medium">
                  {t("account:languageSettings")}
                </h3>
              </div>

              {/* Language Dropdown using Shadcn */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between text-white border-[#353e34] hover:bg-white/10"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-lg">
                        {languages.find(
                          (lang) => lang.code === selectedLanguage
                        )?.flag || "🇬🇧"}
                      </span>
                      <span>
                        {languages.find(
                          (lang) => lang.code === selectedLanguage
                        )?.nativeName || "English"}
                      </span>
                    </span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="bg-[#1a1a1a] border-[#353e34] z-[9999]"
                  sideOffset={4}
                >
                  {languages.map((language) => (
                    <DropdownMenuItem
                      key={language.code}
                      onClick={() => handleLanguageChange(language.code)}
                      className={`text-white hover:bg-white/10 ${
                        selectedLanguage === language.code
                          ? "bg-[#c82a54]/20 text-[#c82a54]"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{language.flag}</span>
                        <div>
                          <div className="font-medium">
                            {language.nativeName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {language.name}
                          </div>
                        </div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SystemMenu;

SystemMenu.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  profile: PropTypes.shape({
    pfpUrl: PropTypes.string,
    displayName: PropTypes.string,
  }),
};
