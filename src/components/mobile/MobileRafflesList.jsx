/**
 * Mobile Raffles List
 * Carousel-based active seasons display with collapsible sections - uses existing Card components
 */

import PropTypes from "prop-types";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import SeasonCardWrapper from "@/components/mobile/SeasonCardWrapper";

export const MobileRafflesList = ({
  activeSeasons = [],
  allSeasons = [],
  onBuy,
  onSell,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation(["raffle"]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedSections, setExpandedSections] = useState({
    active: true,
    all: false,
  });

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handlePrevious = () => {
    setActiveIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setActiveIndex((prev) => Math.min(activeSeasons.length - 1, prev + 1));
  };

  const handleSeasonClick = (seasonId) => {
    navigate(`/raffles/${seasonId}`);
  };

  return (
    <div className="px-3 pt-2 pb-4 max-w-screen-sm mx-auto">
      {/* Page Title */}
      <h1 className="text-white text-2xl font-bold mb-4">{t("raffles")}</h1>

      {/* Active Seasons Section */}
      <div className="mb-6">
        <button
          onClick={() => toggleSection("active")}
          className="flex items-center justify-between w-full mb-4"
        >
          <h2 className="text-white text-lg font-semibold">
            {t("activeSeasons")}
          </h2>
          <ChevronDown
            className={`w-5 h-5 text-[#a89e99] transition-transform ${
              expandedSections.active ? "rotate-180" : ""
            }`}
          />
        </button>

        {expandedSections.active && (
          <div className="space-y-4">
            {activeSeasons.length > 0 ? (
              <>
                {/* Carousel */}
                <div className="relative">
                  <div className="overflow-hidden">
                    <div
                      className="flex transition-transform duration-300 ease-out gap-4"
                      style={{
                        transform: `translateX(-${activeIndex * 100}%)`,
                      }}
                    >
                      {activeSeasons.map((season) => (
                        <div
                          key={season.seasonId}
                          className="flex-shrink-0 w-full flex justify-center"
                        >
                          <SeasonCardWrapper
                            seasonId={season.seasonId}
                            seasonConfig={season.config}
                            status={season.status}
                            onBuy={() => onBuy?.(season.seasonId)}
                            onSell={() => onSell?.(season.seasonId)}
                            onClick={() => handleSeasonClick(season.seasonId)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Navigation Arrows */}
                  {activeSeasons.length > 1 && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handlePrevious}
                        disabled={activeIndex === 0}
                        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 bg-[#130013]/80 hover:bg-[#130013] disabled:opacity-30"
                      >
                        <ChevronLeft className="w-5 h-5 text-white" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleNext}
                        disabled={activeIndex === activeSeasons.length - 1}
                        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 bg-[#130013]/80 hover:bg-[#130013] disabled:opacity-30"
                      >
                        <ChevronRight className="w-5 h-5 text-white" />
                      </Button>
                    </>
                  )}
                </div>

                {/* Pagination Dots */}
                {activeSeasons.length > 1 && (
                  <div className="flex justify-center gap-2 mt-4">
                    {activeSeasons.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setActiveIndex(index)}
                        className={`w-2 h-2 rounded-full transition-colors ${
                          index === activeIndex
                            ? "bg-[#c82a54]"
                            : "bg-[#6b6b6b]"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-[#a89e99]">
                {t("noActiveSeasons")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* All Seasons Section */}
      <div>
        <button
          onClick={() => toggleSection("all")}
          className="flex items-center justify-between w-full mb-4"
        >
          <h2 className="text-white text-lg font-semibold">
            {t("allSeasons")}
          </h2>
          <ChevronDown
            className={`w-5 h-5 text-[#a89e99] transition-transform ${
              expandedSections.all ? "rotate-180" : ""
            }`}
          />
        </button>

        {expandedSections.all && (
          <div className="space-y-3">
            {allSeasons.length > 0 ? (
              allSeasons.map((season) => (
                <Card
                  key={season.id}
                  onClick={() => handleSeasonClick(season.id)}
                  className="cursor-pointer hover:border-[#c82a54]/50 transition-colors border-[#353e34] bg-[#130013]"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-sm text-[#f9d6de]">
                          #{season.id}
                        </span>
                        <span className="font-medium truncate">
                          {season.config?.name}
                        </span>
                        <Badge
                          variant={
                            season.status === 2
                              ? "statusCompleted"
                              : season.status === 1
                              ? "statusActive"
                              : "statusUpcoming"
                          }
                        >
                          {season.status === 2
                            ? "Ended"
                            : season.status === 1
                            ? "Active"
                            : "Pending"}
                        </Badge>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">
                No seasons available
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

MobileRafflesList.propTypes = {
  activeSeasons: PropTypes.array,
  allSeasons: PropTypes.array,
  onBuy: PropTypes.func,
  onSell: PropTypes.func,
};

export default MobileRafflesList;
