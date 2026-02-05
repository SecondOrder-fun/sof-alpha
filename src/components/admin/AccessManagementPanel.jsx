/**
 * AccessManagementPanel - Admin panel for access control management
 * Sections: User Lookup & Management, Default Access Level, Access Groups
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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  Users,
  Settings,
  Plus,
  Trash2,
  Search,
  RefreshCw,
  UserPlus,
  ChevronDown,
  ChevronRight,
  Save,
  Route,
  Globe,
  Lock,
  ToggleLeft,
} from "lucide-react";
/* native checkboxes used instead of shadcn Checkbox */
import { useAdminAuth } from "@/hooks/useAdminAuth";

const API_BASE = import.meta.env.VITE_API_BASE_URL + "/access";

const ACCESS_LEVEL_OPTIONS = [
  { value: "0", label: "PUBLIC (0)" },
  { value: "1", label: "CONNECTED (1)" },
  { value: "2", label: "ALLOWLIST (2)" },
  { value: "3", label: "BETA (3)" },
  { value: "4", label: "ADMIN (4)" },
];

function accessLevelBadge(level) {
  const colors = {
    0: "bg-gray-500",
    1: "bg-blue-500",
    2: "bg-green-500",
    3: "bg-yellow-500 text-black",
    4: "bg-red-500",
  };
  const names = { 0: "PUBLIC", 1: "CONNECTED", 2: "ALLOWLIST", 3: "BETA", 4: "ADMIN" };
  return (
    <Badge className={colors[level] || "bg-gray-500"}>
      {names[level] || `LEVEL ${level}`}
    </Badge>
  );
}

// ─── Section 1: User Access Lookup & Management ─────────────────────────────

function UserAccessSection({ getAuthHeaders }) {
  const queryClient = useQueryClient();
  const [lookupInput, setLookupInput] = useState("");
  const [lookupParams, setLookupParams] = useState(null);
  const [newAccessLevel, setNewAccessLevel] = useState(null);

  const lookupQuery = useQuery({
    queryKey: ["access-lookup", lookupParams],
    queryFn: async () => {
      if (!lookupParams) return null;
      const params = new URLSearchParams();
      if (lookupParams.fid) params.set("fid", lookupParams.fid);
      if (lookupParams.wallet) params.set("wallet", lookupParams.wallet);
      const res = await fetch(`${API_BASE}/check?${params}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to look up user");
      return res.json();
    },
    enabled: !!lookupParams,
  });

  const setAccessMutation = useMutation({
    mutationFn: async ({ fid, accessLevel }) => {
      const res = await fetch(`${API_BASE}/set-access-level`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ fid, accessLevel }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to set access level");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-lookup"] });
      setNewAccessLevel(null);
    },
  });

  const handleLookup = () => {
    const input = lookupInput.trim();
    if (!input) return;
    if (input.match(/^0x[a-fA-F0-9]{40}$/)) {
      setLookupParams({ wallet: input });
    } else if (/^\d+$/.test(input)) {
      setLookupParams({ fid: input });
    } else {
      alert("Enter a valid FID (number) or wallet address (0x...)");
    }
  };

  const handleSave = () => {
    const entry = lookupQuery.data?.entry;
    if (!entry?.fid && !lookupParams?.fid) {
      alert("Cannot update: no FID found for this user");
      return;
    }
    const fid = entry?.fid || parseInt(lookupParams.fid, 10);
    setAccessMutation.mutate({
      fid,
      accessLevel: parseInt(newAccessLevel, 10),
    });
  };

  const userData = lookupQuery.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Search className="h-5 w-5" />
          User Access Lookup
        </CardTitle>
        <CardDescription>
          Look up a user by wallet address or FID and manage their access level
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="FID (e.g., 12345) or wallet (0x...)"
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          />
          <Button onClick={handleLookup} disabled={lookupQuery.isFetching || !lookupInput.trim()}>
            <Search className="h-4 w-4 mr-1" />
            Lookup
          </Button>
        </div>

        {lookupQuery.isError && (
          <p className="text-sm text-red-500">{lookupQuery.error.message}</p>
        )}

        {userData && (
          <div className="space-y-4 border rounded-md p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Access Level</Label>
                <div className="mt-1">{accessLevelBadge(userData.accessLevel)}</div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Level Name</Label>
                <p className="mt-1 text-sm font-medium">{userData.levelName}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Allowlisted</Label>
                <p className="mt-1 text-sm">
                  {userData.isAllowlisted ? (
                    <Badge className="bg-green-500">Yes</Badge>
                  ) : (
                    <Badge variant="secondary">No</Badge>
                  )}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Groups</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {userData.groups?.length > 0
                    ? userData.groups.map((g) => (
                        <Badge key={g} variant="outline">{g}</Badge>
                      ))
                    : <span className="text-sm text-muted-foreground">None</span>}
                </div>
              </div>
            </div>

            {userData.entry && (
              <div className="text-xs text-muted-foreground space-y-1 border-t pt-2">
                {userData.entry.fid && <p>FID: {userData.entry.fid}</p>}
                {userData.entry.wallet_address && (
                  <p>Wallet: {userData.entry.wallet_address}</p>
                )}
                {userData.entry.username && <p>Username: @{userData.entry.username}</p>}
                {userData.entry.added_at && (
                  <p>Added: {new Date(userData.entry.added_at).toLocaleString()}</p>
                )}
                {userData.entry.source && <p>Source: {userData.entry.source}</p>}
              </div>
            )}

            <div className="flex items-end gap-2 border-t pt-3">
              <div className="flex-1">
                <Label className="text-xs">Change Access Level</Label>
                <Select
                  value={newAccessLevel ?? String(userData.accessLevel)}
                  onValueChange={setNewAccessLevel}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_LEVEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleSave}
                disabled={
                  setAccessMutation.isPending ||
                  newAccessLevel === null ||
                  newAccessLevel === String(userData.accessLevel)
                }
              >
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </div>

            {setAccessMutation.isError && (
              <p className="text-sm text-red-500">{setAccessMutation.error.message}</p>
            )}
            {setAccessMutation.isSuccess && (
              <p className="text-sm text-green-500">Access level updated successfully</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 2: Default Access Level ────────────────────────────────────────

function DefaultAccessSection({ getAuthHeaders }) {
  const queryClient = useQueryClient();
  const [newDefault, setNewDefault] = useState(null);

  const defaultQuery = useQuery({
    queryKey: ["access-default-level"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/default-level`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch default level");
      return res.json();
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (level) => {
      const res = await fetch(`${API_BASE}/set-default-level`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ level: parseInt(level, 10) }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to set default level");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-default-level"] });
      setNewDefault(null);
    },
  });

  const currentLevel = defaultQuery.data?.defaultLevel;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Default Access Level
        </CardTitle>
        <CardDescription>
          The access level automatically assigned to new users
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {defaultQuery.isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : defaultQuery.isError ? (
          <p className="text-sm text-red-500">{defaultQuery.error.message}</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Label className="text-muted-foreground">Current:</Label>
              {accessLevelBadge(currentLevel)}
              <span className="text-sm text-muted-foreground">
                ({defaultQuery.data?.levelName})
              </span>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs">Change Default Level</Label>
                <Select
                  value={newDefault ?? String(currentLevel)}
                  onValueChange={setNewDefault}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_LEVEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => setDefaultMutation.mutate(newDefault)}
                disabled={
                  setDefaultMutation.isPending ||
                  newDefault === null ||
                  newDefault === String(currentLevel)
                }
              >
                <Save className="h-4 w-4 mr-1" />
                Update
              </Button>
            </div>

            {setDefaultMutation.isError && (
              <p className="text-sm text-red-500">{setDefaultMutation.error.message}</p>
            )}
            {setDefaultMutation.isSuccess && (
              <p className="text-sm text-green-500">Default level updated</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 3: Access Groups ───────────────────────────────────────────────

function AccessGroupsSection({ getAuthHeaders }) {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", slug: "", description: "" });
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [addMemberFid, setAddMemberFid] = useState("");

  // Fetch all groups
  const groupsQuery = useQuery({
    queryKey: ["access-groups"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/groups`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch groups");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Fetch members of expanded group
  const membersQuery = useQuery({
    queryKey: ["access-group-members", expandedGroup],
    queryFn: async () => {
      if (!expandedGroup) return null;
      const res = await fetch(`${API_BASE}/groups/${expandedGroup}/members`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
    enabled: !!expandedGroup,
  });

  // Create group
  const createGroupMutation = useMutation({
    mutationFn: async (group) => {
      const res = await fetch(`${API_BASE}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(group),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create group");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-groups"] });
      setNewGroup({ name: "", slug: "", description: "" });
      setShowCreateForm(false);
    },
  });

  // Delete group
  const deleteGroupMutation = useMutation({
    mutationFn: async (slug) => {
      const res = await fetch(`${API_BASE}/groups/${slug}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete group");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-groups"] });
      if (expandedGroup) setExpandedGroup(null);
    },
  });

  // Add member
  const addMemberMutation = useMutation({
    mutationFn: async ({ fid, groupSlug }) => {
      const res = await fetch(`${API_BASE}/groups/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ fid: parseInt(fid, 10), groupSlug }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add member");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-group-members"] });
      queryClient.invalidateQueries({ queryKey: ["access-groups"] });
      setAddMemberFid("");
    },
  });

  // Remove member
  const removeMemberMutation = useMutation({
    mutationFn: async ({ fid, groupSlug }) => {
      const res = await fetch(`${API_BASE}/groups/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ fid: parseInt(fid, 10), groupSlug }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove member");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-group-members"] });
      queryClient.invalidateQueries({ queryKey: ["access-groups"] });
    },
  });

  const handleCreateGroup = () => {
    if (!newGroup.name || !newGroup.slug) {
      alert("Name and slug are required");
      return;
    }
    createGroupMutation.mutate(newGroup);
  };

  const autoSlug = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const groups = groupsQuery.data?.groups || [];
  const members = membersQuery.data?.members || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Access Groups
            </CardTitle>
            <CardDescription>
              Manage groups and their members
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => groupsQuery.refetch()}
              disabled={groupsQuery.isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${groupsQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
            <Button
              size="sm"
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              <Plus className="h-4 w-4 mr-1" />
              New Group
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create Group Form */}
        {showCreateForm && (
          <div className="border rounded-md p-4 space-y-3">
            <h4 className="text-sm font-medium">Create New Group</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  placeholder="Beta Testers"
                  value={newGroup.name}
                  onChange={(e) =>
                    setNewGroup({
                      ...newGroup,
                      name: e.target.value,
                      slug: newGroup.slug || autoSlug(e.target.value),
                    })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Slug</Label>
                <Input
                  placeholder="beta-testers"
                  value={newGroup.slug}
                  onChange={(e) =>
                    setNewGroup({ ...newGroup, slug: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Input
                placeholder="Users with beta access"
                value={newGroup.description}
                onChange={(e) =>
                  setNewGroup({ ...newGroup, description: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreateGroup}
                disabled={createGroupMutation.isPending}
              >
                Create
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewGroup({ name: "", slug: "", description: "" });
                }}
              >
                Cancel
              </Button>
            </div>
            {createGroupMutation.isError && (
              <p className="text-sm text-red-500">{createGroupMutation.error.message}</p>
            )}
          </div>
        )}

        {/* Groups List */}
        {groupsQuery.isLoading ? (
          <p className="text-muted-foreground">Loading groups...</p>
        ) : groupsQuery.isError ? (
          <p className="text-sm text-red-500">{groupsQuery.error.message}</p>
        ) : groups.length === 0 ? (
          <p className="text-muted-foreground">No groups created yet</p>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => (
              <div key={group.slug} className="border rounded-md">
                {/* Group Header */}
                <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    setExpandedGroup(expandedGroup === group.slug ? null : group.slug)
                  }
                >
                  <div className="flex items-center gap-3">
                    {expandedGroup === group.slug ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <span className="font-medium text-sm">{group.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({group.slug})
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      <Users className="h-3 w-3 mr-1" />
                      {group.member_count ?? "—"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete group "${group.name}"?`)) {
                          deleteGroupMutation.mutate(group.slug);
                        }
                      }}
                      disabled={deleteGroupMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                {/* Expanded Group Details */}
                {expandedGroup === group.slug && (
                  <div className="border-t p-3 space-y-3">
                    {group.description && (
                      <p className="text-sm text-muted-foreground">
                        {group.description}
                      </p>
                    )}

                    {/* Add Member */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="FID to add"
                        value={addMemberFid}
                        onChange={(e) => setAddMemberFid(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && addMemberFid.trim()) {
                            addMemberMutation.mutate({
                              fid: addMemberFid.trim(),
                              groupSlug: group.slug,
                            });
                          }
                        }}
                        className="max-w-[200px]"
                      />
                      <Button
                        size="sm"
                        onClick={() =>
                          addMemberMutation.mutate({
                            fid: addMemberFid.trim(),
                            groupSlug: group.slug,
                          })
                        }
                        disabled={addMemberMutation.isPending || !addMemberFid.trim()}
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                    {addMemberMutation.isError && (
                      <p className="text-sm text-red-500">{addMemberMutation.error.message}</p>
                    )}
                    {addMemberMutation.isSuccess && (
                      <p className="text-sm text-green-500">Member added</p>
                    )}

                    {/* Members Table */}
                    {membersQuery.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading members...</p>
                    ) : membersQuery.isError ? (
                      <p className="text-sm text-red-500">{membersQuery.error.message}</p>
                    ) : members.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No members in this group</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>FID</TableHead>
                              <TableHead>Username</TableHead>
                              <TableHead>Added</TableHead>
                              <TableHead></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {members.map((member) => (
                              <TableRow key={member.fid}>
                                <TableCell className="font-mono text-sm">
                                  {member.fid}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {member.username ? `@${member.username}` : "—"}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {member.joined_at
                                    ? new Date(member.joined_at).toLocaleDateString()
                                    : "—"}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      if (
                                        confirm(
                                          `Remove FID ${member.fid} from ${group.name}?`,
                                        )
                                      ) {
                                        removeMemberMutation.mutate({
                                          fid: member.fid,
                                          groupSlug: group.slug,
                                        });
                                      }
                                    }}
                                    disabled={removeMemberMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 4: Route Access Configuration ──────────────────────────────────

const ROUTE_LEVEL_COLORS = {
  0: "bg-green-500",
  1: "bg-blue-500",
  2: "bg-yellow-500 text-black",
  3: "bg-purple-500",
  4: "bg-red-500",
};

const RESOURCE_TYPE_OPTIONS = [
  { value: "page", label: "Page" },
  { value: "feature", label: "Feature" },
  { value: "api", label: "API" },
];

function routeLevelBadge(level) {
  const names = { 0: "PUBLIC", 1: "CONNECTED", 2: "ALLOWLIST", 3: "BETA", 4: "ADMIN" };
  return (
    <Badge className={ROUTE_LEVEL_COLORS[level] || "bg-gray-500"}>
      {names[level] || `LEVEL ${level}`}
    </Badge>
  );
}

function RouteConfigSection({ getAuthHeaders }) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRoute, setNewRoute] = useState({
    routePattern: "",
    name: "",
    requiredLevel: "0",
    resourceType: "page",
    isPublic: false,
    isDisabled: false,
  });
  const [editingRoute, setEditingRoute] = useState(null);

  // Fetch all route configs
  const configsQuery = useQuery({
    queryKey: ["access-route-configs"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/route-configs`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch route configs");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Create / update route config
  const upsertMutation = useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`${API_BASE}/route-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save route config");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-route-configs"] });
      setEditingRoute(null);
    },
  });

  // Toggle public override
  const togglePublicMutation = useMutation({
    mutationFn: async ({ routePattern, isPublic }) => {
      const res = await fetch(`${API_BASE}/set-public-override`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ routePattern, isPublic }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to toggle public override");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-route-configs"] });
    },
  });

  // Toggle disabled
  const toggleDisabledMutation = useMutation({
    mutationFn: async ({ routePattern, isDisabled }) => {
      const res = await fetch(`${API_BASE}/set-disabled`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ routePattern, isDisabled }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to toggle disabled status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-route-configs"] });
    },
  });

  // Delete route config
  const deleteMutation = useMutation({
    mutationFn: async (routePattern) => {
      const encoded = encodeURIComponent(routePattern);
      const res = await fetch(`${API_BASE}/route-config/${encoded}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete route config");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-route-configs"] });
    },
  });

  const handleAddRoute = () => {
    if (!newRoute.routePattern.trim()) {
      alert("Route pattern is required");
      return;
    }
    upsertMutation.mutate({
      routePattern: newRoute.routePattern.trim(),
      name: newRoute.name.trim() || undefined,
      requiredLevel: parseInt(newRoute.requiredLevel, 10),
      resourceType: newRoute.resourceType,
      isPublic: newRoute.isPublic,
      isDisabled: newRoute.isDisabled,
    });
    setNewRoute({
      routePattern: "",
      name: "",
      requiredLevel: "0",
      resourceType: "page",
      isPublic: false,
      isDisabled: false,
    });
    setShowAddForm(false);
  };

  const handleLevelChange = (routePattern, newLevel) => {
    upsertMutation.mutate({
      routePattern,
      requiredLevel: parseInt(newLevel, 10),
    });
  };

  const configs = configsQuery.data?.configs || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Route className="h-5 w-5" />
              Route Access Configuration
            </CardTitle>
            <CardDescription>
              Configure access requirements for individual routes
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => configsQuery.refetch()}
              disabled={configsQuery.isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${configsQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
            <Button
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Route
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add New Route Form */}
        {showAddForm && (
          <div className="border rounded-md p-4 space-y-3">
            <h4 className="text-sm font-medium">Add New Route Config</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Route Pattern</Label>
                <Input
                  placeholder="/markets"
                  value={newRoute.routePattern}
                  onChange={(e) =>
                    setNewRoute({ ...newRoute, routePattern: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  placeholder="InfoFi Markets"
                  value={newRoute.name}
                  onChange={(e) =>
                    setNewRoute({ ...newRoute, name: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Required Level</Label>
                <Select
                  value={newRoute.requiredLevel}
                  onValueChange={(v) =>
                    setNewRoute({ ...newRoute, requiredLevel: v })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_LEVEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Resource Type</Label>
                <Select
                  value={newRoute.resourceType}
                  onValueChange={(v) =>
                    setNewRoute({ ...newRoute, resourceType: v })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOURCE_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={newRoute.isPublic}
                  onChange={(e) =>
                    setNewRoute({ ...newRoute, isPublic: e.target.checked })
                  }
                  className="rounded border-input"
                />
                <Globe className="h-4 w-4 text-muted-foreground" />
                Public Override
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={newRoute.isDisabled}
                  onChange={(e) =>
                    setNewRoute({ ...newRoute, isDisabled: e.target.checked })
                  }
                  className="rounded border-input"
                />
                <Lock className="h-4 w-4 text-muted-foreground" />
                Disabled (Maintenance)
              </label>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAddRoute}
                disabled={upsertMutation.isPending}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Route
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowAddForm(false);
                  setNewRoute({
                    routePattern: "",
                    name: "",
                    requiredLevel: "0",
                    resourceType: "page",
                    isPublic: false,
                    isDisabled: false,
                  });
                }}
              >
                Cancel
              </Button>
            </div>
            {upsertMutation.isError && (
              <p className="text-sm text-red-500">{upsertMutation.error.message}</p>
            )}
          </div>
        )}

        {/* Route Configs Table */}
        {configsQuery.isLoading ? (
          <p className="text-muted-foreground">Loading route configs...</p>
        ) : configsQuery.isError ? (
          <p className="text-sm text-red-500">{configsQuery.error.message}</p>
        ) : configs.length === 0 ? (
          <p className="text-muted-foreground">No route configs yet</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route Pattern</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Required Level</TableHead>
                  <TableHead className="text-center">Public</TableHead>
                  <TableHead className="text-center">Disabled</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((cfg) => (
                  <TableRow key={cfg.route_pattern || cfg.routePattern}>
                    <TableCell className="font-mono text-sm">
                      {cfg.route_pattern || cfg.routePattern}
                    </TableCell>
                    <TableCell className="text-sm">
                      {cfg.name || "—"}
                    </TableCell>
                    <TableCell>
                      {editingRoute === (cfg.route_pattern || cfg.routePattern) ? (
                        <Select
                          value={String(cfg.required_level ?? cfg.requiredLevel ?? 0)}
                          onValueChange={(v) => {
                            handleLevelChange(
                              cfg.route_pattern || cfg.routePattern,
                              v,
                            );
                          }}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACCESS_LEVEL_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <button
                          className="cursor-pointer hover:opacity-80"
                          onClick={() =>
                            setEditingRoute(cfg.route_pattern || cfg.routePattern)
                          }
                          title="Click to change level"
                        >
                          {routeLevelBadge(cfg.required_level ?? cfg.requiredLevel ?? 0)}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() =>
                          togglePublicMutation.mutate({
                            routePattern: cfg.route_pattern || cfg.routePattern,
                            isPublic: !(cfg.is_public ?? cfg.isPublic),
                          })
                        }
                        disabled={togglePublicMutation.isPending}
                        title={
                          (cfg.is_public ?? cfg.isPublic)
                            ? "Public — click to remove override"
                            : "Not public — click to set public"
                        }
                        className="inline-flex"
                      >
                        <Globe
                          className={`h-5 w-5 ${
                            (cfg.is_public ?? cfg.isPublic)
                              ? "text-green-500"
                              : "text-muted-foreground/40"
                          }`}
                        />
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() =>
                          toggleDisabledMutation.mutate({
                            routePattern: cfg.route_pattern || cfg.routePattern,
                            isDisabled: !(cfg.is_disabled ?? cfg.isDisabled),
                          })
                        }
                        disabled={toggleDisabledMutation.isPending}
                        title={
                          (cfg.is_disabled ?? cfg.isDisabled)
                            ? "Disabled — click to enable"
                            : "Enabled — click to disable"
                        }
                        className="inline-flex"
                      >
                        <Lock
                          className={`h-5 w-5 ${
                            (cfg.is_disabled ?? cfg.isDisabled)
                              ? "text-red-500"
                              : "text-muted-foreground/40"
                          }`}
                        />
                      </button>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const pattern = cfg.route_pattern || cfg.routePattern;
                          if (confirm(`Delete route config "${pattern}"?`)) {
                            deleteMutation.mutate(pattern);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {deleteMutation.isError && (
          <p className="text-sm text-red-500">{deleteMutation.error.message}</p>
        )}
        {togglePublicMutation.isError && (
          <p className="text-sm text-red-500">{togglePublicMutation.error.message}</p>
        )}
        {toggleDisabledMutation.isError && (
          <p className="text-sm text-red-500">{toggleDisabledMutation.error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AccessManagementPanel() {
  const { getAuthHeaders } = useAdminAuth();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold">Access Management</h3>
          <p className="text-sm text-muted-foreground">
            Manage user access levels, defaults, and groups
          </p>
        </div>
      </div>

      {/* Section 1: User Lookup */}
      <UserAccessSection getAuthHeaders={getAuthHeaders} />

      {/* Section 2: Default Access Level */}
      <DefaultAccessSection getAuthHeaders={getAuthHeaders} />

      {/* Section 3: Access Groups */}
      <AccessGroupsSection getAuthHeaders={getAuthHeaders} />

      {/* Section 4: Route Access Configuration */}
      <RouteConfigSection getAuthHeaders={getAuthHeaders} />
    </div>
  );
}
