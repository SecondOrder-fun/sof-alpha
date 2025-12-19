/**
 * Admin Notification Panel
 * Allows sending manual notifications to Farcaster/Base App users
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bell, Send, Users, RefreshCw } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Fetch notification statistics
 */
async function fetchNotificationStats() {
  const response = await fetch(`${API_BASE_URL}/admin/notification-stats`);
  if (!response.ok) {
    throw new Error("Failed to fetch notification stats");
  }
  return response.json();
}

/**
 * Fetch notification tokens list
 */
async function fetchNotificationTokens() {
  const response = await fetch(`${API_BASE_URL}/admin/notification-tokens`);
  if (!response.ok) {
    throw new Error("Failed to fetch notification tokens");
  }
  return response.json();
}

/**
 * Send a notification
 */
async function sendNotification({ fid, title, body, targetUrl }) {
  const response = await fetch(`${API_BASE_URL}/admin/send-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fid, title, body, targetUrl }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to send notification");
  }

  return response.json();
}

function NotificationPanel() {
  const queryClient = useQueryClient();

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetUrl, setTargetUrl] = useState("https://secondorder.fun");
  const [fid, setFid] = useState("");
  const [sendToAll, setSendToAll] = useState(true);

  // Fetch stats
  const statsQuery = useQuery({
    queryKey: ["notificationStats"],
    queryFn: fetchNotificationStats,
    refetchInterval: 30000,
  });

  // Fetch tokens
  const tokensQuery = useQuery({
    queryKey: ["notificationTokens"],
    queryFn: fetchNotificationTokens,
  });

  // Send notification mutation
  const sendMutation = useMutation({
    mutationFn: sendNotification,
    onSuccess: () => {
      setTitle("");
      setBody("");
      setFid("");
      queryClient.invalidateQueries({ queryKey: ["notificationStats"] });
    },
  });

  const handleSend = () => {
    if (!title.trim() || !body.trim()) {
      return;
    }

    sendMutation.mutate({
      fid: sendToAll ? undefined : parseInt(fid, 10),
      title: title.trim(),
      body: body.trim(),
      targetUrl: targetUrl.trim() || "https://secondorder.fun",
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {/* Stats Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Notification Stats
            </CardTitle>
            <CardDescription>Users with notifications enabled</CardDescription>
          </CardHeader>
          <CardContent>
            {statsQuery.isLoading ? (
              <p className="text-muted-foreground">Loading stats...</p>
            ) : statsQuery.error ? (
              <p className="text-red-500">Error: {statsQuery.error.message}</p>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Tokens:</span>
                  <Badge variant="secondary">
                    {statsQuery.data?.totalTokens || 0}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Unique Users:</span>
                  <Badge variant="secondary">
                    {statsQuery.data?.uniqueUsers || 0}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    queryClient.invalidateQueries({
                      queryKey: ["notificationStats"],
                    });
                    queryClient.invalidateQueries({
                      queryKey: ["notificationTokens"],
                    });
                  }}
                  className="w-full mt-2"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Send Notification Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Send Notification
            </CardTitle>
            <CardDescription>Send a push notification to users</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Notification title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={50}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                placeholder="Notification message"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={200}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetUrl">Target URL</Label>
              <Input
                id="targetUrl"
                placeholder="https://secondorder.fun"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sendToAll"
                  checked={sendToAll}
                  onChange={(e) => setSendToAll(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="sendToAll">Send to all users</Label>
              </div>

              {!sendToAll && (
                <div className="space-y-2">
                  <Label htmlFor="fid">User FID</Label>
                  <Input
                    id="fid"
                    type="number"
                    placeholder="Enter Farcaster ID"
                    value={fid}
                    onChange={(e) => setFid(e.target.value)}
                  />
                </div>
              )}
            </div>

            <Button
              onClick={handleSend}
              disabled={
                !title.trim() ||
                !body.trim() ||
                sendMutation.isPending ||
                (!sendToAll && !fid)
              }
              className="w-full"
            >
              {sendMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  {sendToAll ? "Send to All Users" : "Send to User"}
                </>
              )}
            </Button>

            {sendMutation.isSuccess && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md">
                <p className="text-green-500 text-sm">
                  Notification sent successfully!
                  {sendMutation.data?.totalTokens && (
                    <span> ({sendMutation.data.totalTokens} tokens)</span>
                  )}
                </p>
              </div>
            )}

            {sendMutation.isError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                <p className="text-red-500 text-sm">
                  Error: {sendMutation.error?.message}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tokens List */}
      <Card>
        <CardHeader>
          <CardTitle>Registered Tokens</CardTitle>
          <CardDescription>
            Users who have enabled notifications (most recent first)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tokensQuery.isLoading ? (
            <p className="text-muted-foreground">Loading tokens...</p>
          ) : tokensQuery.error ? (
            <p className="text-red-500">Error: {tokensQuery.error.message}</p>
          ) : tokensQuery.data?.tokens?.length === 0 ? (
            <p className="text-muted-foreground">
              No notification tokens registered yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">FID</th>
                    <th className="text-left py-2 px-2">Client</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tokensQuery.data?.tokens?.map((token) => {
                    const getClientName = (appKey) => {
                      if (!appKey) return "Unknown";
                      if (
                        appKey.includes("base") ||
                        appKey.startsWith("0x73de7de2")
                      )
                        return "Base";
                      if (
                        appKey.includes("warpcast") ||
                        appKey.startsWith("0xbe5ab039")
                      )
                        return "Warpcast";
                      return appKey.substring(0, 10) + "...";
                    };
                    return (
                      <tr key={token.id} className="border-b border-border/50">
                        <td className="py-2 px-2 font-mono">{token.fid}</td>
                        <td className="py-2 px-2">
                          <Badge variant="outline">
                            {getClientName(token.app_key)}
                          </Badge>
                        </td>
                        <td className="py-2 px-2">
                          {token.notifications_enabled ? (
                            <Badge variant="default" className="bg-green-500">
                              Enabled
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Disabled</Badge>
                          )}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">
                          {new Date(token.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default NotificationPanel;
