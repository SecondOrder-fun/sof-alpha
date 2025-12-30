/**
 * Mobile Raffles List
 * Carousel-based active seasons display with collapsible sections
 */

import PropTypes from "prop-types";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import SeasonCard from "./SeasonCard";
import { Button } from "../ui/button";

export const MobileRafflesList = ({
  activeSeasons = [],
  allSeasons = [],
  onBuy,
  onSell,
}) => {
  const navigate = useNavigate();
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
    navigate(`/raffle/${seasonId}`);
  };

  return (
    <div className="px-4 py-6">
      {/* Page Title */}
      <h1 className="text-white text-2xl font-bold mb-6">Raffles</h1>

      {/* Active Seasons Section */}
      <div className="mb-6">
        <button
          onClick={() => toggleSection("active")}
          className="flex items-center justify-between w-full mb-4"
        >
          <h2 className="text-white text-lg font-semibold">Active Seasons</h2>
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
                          <SeasonCard
                            seasonId={season.seasonId}
                            seasonConfig={season.config}
                            curveStep={season.curveStep}
                            allBondSteps={season.allBondSteps}
                            curveSupply={season.curveSupply}
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
                No active seasons
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
          <h2 className="text-white text-lg font-semibold">All Seasons</h2>
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
                <div
                  key={season.seasonId}
                  onClick={() => handleSeasonClick(season.seasonId)}
                  className="bg-[#6b6b6b] rounded-lg p-4 cursor-pointer hover:bg-[#6b6b6b]/90 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-semibold text-sm">
                        Season #{season.seasonId}: {season.config?.name}
                      </h3>
                      <p className="text-[#a89e99] text-xs mt-1">
                        {season.status === 2
                          ? "Ended"
                          : season.status === 1
                          ? "Active"
                          : "Pending"}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[#a89e99]" />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-[#a89e99]">
                No seasons found
              </div>
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
