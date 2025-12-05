// src/features/admin/components/BackendWalletManager.jsx
// Backend wallet management and monitoring component

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle,
  Copy,
  RefreshCw,
  Wallet,
} from "lucide-react";
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";
import { useToast } from "@/hooks/useToast";

export function BackendWalletManager() {
  const { toast } = useToast();

  // Query backend wallet info
  const {
    data: walletInfo,
    refetch: refetchWallet,
    isLoading: isLoadingWallet,
  } = useQuery({
    queryKey: ["backendWallet"],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/admin/backend-wallet`);
      if (!response.ok) throw new Error("Failed to fetch wallet info");
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  // Query market creation stats
  const {
    data: stats,
    refetch: refetchStats,
    isLoading: isLoadingStats,
  } = useQuery({
    queryKey: ["marketCreationStats"],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/admin/market-creation-stats`);
      if (!response.ok) throw new Error("Failed to fetch stats");
      return response.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const getBalanceColor = (balanceEth) => {
    if (balanceEth > 0.5) return "text-green-600";
    if (balanceEth > 0.2) return "text-yellow-600";
    return "text-red-600";
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Address copied to clipboard",
    });
  };

  const handleRefresh = () => {
    refetchWallet();
    refetchStats();
    toast({
      title: "Refreshed",
      description: "Wallet and stats data updated",
    });
  };

  if (isLoadingWallet || isLoadingStats) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6" />
          Backend Wallet Management
        </h2>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Wallet Status Card */}
      <Card>
        <CardHeader>
          <CardTitle>Wallet Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">Address</label>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-sm bg-muted px-2 py-1 rounded">
                {walletInfo?.address || "Not configured"}
              </code>
              {walletInfo?.address && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(walletInfo.address)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">
                ETH Balance
              </label>
              <div
                className={`text-2xl font-bold ${getBalanceColor(
                  walletInfo?.balanceEth || 0
                )}`}
              >
                {walletInfo?.balanceEth?.toFixed(4) || "0.0000"} ETH
              </div>
              {walletInfo?.balanceEth < 0.2 && (
                <div className="flex items-center gap-2 text-red-600 text-sm mt-2">
                  <AlertCircle className="h-4 w-4" />
                  Low balance! Fund wallet soon.
                </div>
              )}
              {walletInfo?.balanceEth >= 0.5 && (
                <div className="flex items-center gap-2 text-green-600 text-sm mt-2">
                  <CheckCircle className="h-4 w-4" />
                  Balance healthy
                </div>
              )}
            </div>

            <div>
              <label className="text-sm text-muted-foreground">
                SOF Balance
              </label>
              <div className="text-2xl font-bold">
                {walletInfo?.sofBalance?.toFixed(2) || "0.00"} SOF
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground">Network</label>
              <div className="text-2xl font-bold">
                <Badge variant="outline">
                  {walletInfo?.network || "Unknown"}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Chain ID: {walletInfo?.chainId || "N/A"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Market Creation Statistics Card */}
      <Card>
        <CardHeader>
          <CardTitle>Market Creation Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Total Created</div>
              <div className="text-2xl font-bold">
                {stats?.totalCreated || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Success Rate</div>
              <div className="text-2xl font-bold">
                {stats?.successRate || 0}%
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">
                Total Gas (ETH)
              </div>
              <div className="text-2xl font-bold">
                {stats?.totalGasEth || "0.0000"}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">
                Failed Attempts
              </div>
              <div
                className={`text-2xl font-bold ${
                  stats?.failedAttempts > 0 ? "text-red-600" : "text-green-600"
                }`}
              >
                {stats?.failedAttempts || 0}
              </div>
            </div>
          </div>

          {/* Recent Markets */}
          {stats?.recentMarkets && stats.recentMarkets.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium mb-3">Recent Markets</h4>
              <div className="space-y-2">
                {stats.recentMarkets.map((market) => (
                  <div
                    key={market.id}
                    className="flex items-center justify-between p-2 bg-muted rounded text-sm"
                  >
                    <span>Market #{market.id}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {new Date(market.createdAt).toLocaleString()}
                      </span>
                      {market.hasContract ? (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Success
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Failed
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alerts and Recommendations */}
      {walletInfo?.balanceEth < 0.5 && (
        <Card className="border-yellow-500 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-700">
              <AlertCircle className="h-5 w-5" />
              Action Required
            </CardTitle>
          </CardHeader>
          <CardContent className="text-yellow-700">
            <p className="mb-2">
              Backend wallet balance is running low. Consider funding the wallet
              to ensure continuous market creation.
            </p>
            <p className="text-sm">
              Recommended minimum: 0.5 ETH for gas costs
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
