// src/components/mobile/RaffleBalanceItem.jsx
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";

/**
 * RaffleBalanceItem - Mobile-optimized raffle position display
 * Shows season info, contract address, and ticket count
 */
const RaffleBalanceItem = ({
  seasonId,
  name,
  contractAddress,
  ticketCount,
}) => {
  return (
    <Link to={`/raffles/${seasonId}`}>
      <Card className="border-border bg-background hover:border-primary/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex justify-between items-center gap-3 mb-2">
            <div className="font-medium text-white">
              #{seasonId} - {name}
            </div>
            <div className="text-right shrink-0">
              <div className="font-bold text-white">{ticketCount}</div>
              <div className="text-xs text-muted-foreground">tickets</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground font-mono truncate">
            {contractAddress}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

RaffleBalanceItem.propTypes = {
  seasonId: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
    .isRequired,
  name: PropTypes.string.isRequired,
  contractAddress: PropTypes.string.isRequired,
  ticketCount: PropTypes.string.isRequired,
};

export default RaffleBalanceItem;
