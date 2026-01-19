import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Video,
  Settings,
  Users,
  MessageSquare,
  Plus,
  Search,
  Edit,
  Trash2,
  ChevronLeft,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Tab = "users" | "prompts";

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Prompt {
  id: string;
  name: string;
  type: string;
  content: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

async function fetchUsers(search?: string): Promise<User[]> {
  const url = search ? `/api/admin/users?search=${encodeURIComponent(search)}` : "/api/admin/users";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

async function fetchPrompts(type?: string): Promise<Prompt[]> {
  const url = type ? `/api/admin/prompts?type=${encodeURIComponent(type)}` : "/api/admin/prompts";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch prompts");
  return res.json();
}

export default function Admin() {
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const [searchQuery, setSearchQuery] = useState("");
  const [promptTypeFilter, setPromptTypeFilter] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);

  const [userForm, setUserForm] = useState({ username: "", email: "", password: "", role: "user", status: "active" });
  const [promptForm, setPromptForm] = useState({ name: "", type: "chat", content: "", description: "", isActive: true });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users", searchQuery],
    queryFn: () => fetchUsers(searchQuery || undefined),
    enabled: activeTab === "users",
  });

  const { data: prompts = [], isLoading: promptsLoading } = useQuery({
    queryKey: ["admin-prompts", promptTypeFilter],
    queryFn: () => fetchPrompts(promptTypeFilter || undefined),
    enabled: activeTab === "prompts",
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof userForm) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setIsUserDialogOpen(false);
      resetUserForm();
      toast({ title: "User created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof userForm> }) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setIsUserDialogOpen(false);
      setEditingUser(null);
      resetUserForm();
      toast({ title: "User updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "User deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete user", variant: "destructive" });
    },
  });

  const createPromptMutation = useMutation({
    mutationFn: async (data: typeof promptForm) => {
      const res = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create prompt");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-prompts"] });
      setIsPromptDialogOpen(false);
      resetPromptForm();
      toast({ title: "Prompt created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updatePromptMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof promptForm> }) => {
      const res = await fetch(`/api/admin/prompts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update prompt");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-prompts"] });
      setIsPromptDialogOpen(false);
      setEditingPrompt(null);
      resetPromptForm();
      toast({ title: "Prompt updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePromptMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/prompts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete prompt");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-prompts"] });
      toast({ title: "Prompt deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete prompt", variant: "destructive" });
    },
  });

  const resetUserForm = () => {
    setUserForm({ username: "", email: "", password: "", role: "user", status: "active" });
  };

  const resetPromptForm = () => {
    setPromptForm({ name: "", type: "chat", content: "", description: "", isActive: true });
  };

  const openEditUser = (user: User) => {
    setEditingUser(user);
    setUserForm({
      username: user.username,
      email: user.email,
      password: "",
      role: user.role,
      status: user.status,
    });
    setIsUserDialogOpen(true);
  };

  const openEditPrompt = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setPromptForm({
      name: prompt.name,
      type: prompt.type,
      content: prompt.content,
      description: prompt.description || "",
      isActive: prompt.isActive,
    });
    setIsPromptDialogOpen(true);
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      const updateData: Record<string, string> = {};
      if (userForm.username !== editingUser.username) updateData.username = userForm.username;
      if (userForm.email !== editingUser.email) updateData.email = userForm.email;
      if (userForm.password) updateData.password = userForm.password;
      if (userForm.role !== editingUser.role) updateData.role = userForm.role;
      if (userForm.status !== editingUser.status) updateData.status = userForm.status;
      updateUserMutation.mutate({ id: editingUser.id, data: updateData });
    } else {
      createUserMutation.mutate(userForm);
    }
  };

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPrompt) {
      updatePromptMutation.mutate({ id: editingPrompt.id, data: promptForm });
    } else {
      createPromptMutation.mutate(promptForm);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-16 border-b border-border flex items-center justify-between px-4 md:px-6 bg-background sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-home">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <Video className="w-5 h-5" />
            </div>
            <span className="text-xl font-medium tracking-tight">VideoAI</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-xl font-medium">Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-muted-foreground" />
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-8">
        <div className="flex gap-4 mb-6 border-b border-border">
          <button
            onClick={() => setActiveTab("users")}
            className={`pb-4 px-2 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "users"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-users"
          >
            <Users className="w-4 h-4" />
            Users
          </button>
          <button
            onClick={() => setActiveTab("prompts")}
            className={`pb-4 px-2 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "prompts"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-prompts"
          >
            <MessageSquare className="w-4 h-4" />
            Prompts
          </button>
        </div>

        {activeTab === "users" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-users"
                />
              </div>
              <Button
                onClick={() => {
                  setEditingUser(null);
                  resetUserForm();
                  setIsUserDialogOpen(true);
                }}
                data-testid="button-add-user"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </div>

            {usersLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No users found</div>
            ) : (
              <>
                <div className="hidden md:block border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                          <TableCell className="font-medium">{user.username}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                              {user.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                user.status === "active"
                                  ? "default"
                                  : user.status === "inactive"
                                  ? "secondary"
                                  : "destructive"
                              }
                            >
                              {user.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditUser(user)}
                                data-testid={`button-edit-user-${user.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteUserMutation.mutate(user.id)}
                                data-testid={`button-delete-user-${user.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="md:hidden space-y-3">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="border rounded-lg p-4 space-y-3"
                      data-testid={`card-user-${user.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-foreground">{user.username}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditUser(user)}
                            data-testid={`button-edit-user-mobile-${user.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteUserMutation.mutate(user.id)}
                            data-testid={`button-delete-user-mobile-${user.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                          {user.role}
                        </Badge>
                        <Badge
                          variant={
                            user.status === "active"
                              ? "default"
                              : user.status === "inactive"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {user.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "prompts" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <Select value={promptTypeFilter || "all"} onValueChange={(val) => setPromptTypeFilter(val === "all" ? "" : val)}>
                <SelectTrigger className="w-[200px]" data-testid="select-prompt-type-filter">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="summary">Summary</SelectItem>
                  <SelectItem value="analysis">Analysis</SelectItem>
                  <SelectItem value="sop">SOP</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={() => {
                  setEditingPrompt(null);
                  resetPromptForm();
                  setIsPromptDialogOpen(true);
                }}
                data-testid="button-add-prompt"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Prompt
              </Button>
            </div>

            {promptsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : prompts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No prompts found</div>
            ) : (
              <>
                <div className="hidden md:block border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prompts.map((prompt) => (
                        <TableRow key={prompt.id} data-testid={`row-prompt-${prompt.id}`}>
                          <TableCell className="font-medium">{prompt.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{prompt.type}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {prompt.description || "-"}
                          </TableCell>
                          <TableCell>
                            {prompt.isActive ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <X className="w-4 h-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditPrompt(prompt)}
                                data-testid={`button-edit-prompt-${prompt.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deletePromptMutation.mutate(prompt.id)}
                                data-testid={`button-delete-prompt-${prompt.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="md:hidden space-y-3">
                  {prompts.map((prompt) => (
                    <div
                      key={prompt.id}
                      className="border rounded-lg p-4 space-y-3"
                      data-testid={`card-prompt-${prompt.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">{prompt.name}</p>
                            {prompt.isActive ? (
                              <Check className="w-4 h-4 text-green-500 shrink-0" />
                            ) : (
                              <X className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {prompt.description || "No description"}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditPrompt(prompt)}
                            data-testid={`button-edit-prompt-mobile-${prompt.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deletePromptMutation.mutate(prompt.id)}
                            data-testid={`button-delete-prompt-mobile-${prompt.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <Badge variant="outline">{prompt.type}</Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Add New User"}</DialogTitle>
            <DialogDescription>
              {editingUser ? "Update user details below." : "Create a new user account."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUserSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                required
                data-testid="input-user-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                required
                data-testid="input-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">
                Password {editingUser && "(leave blank to keep current)"}
              </Label>
              <Input
                id="password"
                type="password"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                required={!editingUser}
                data-testid="input-user-password"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={userForm.role}
                  onValueChange={(value) => setUserForm({ ...userForm, role: value })}
                >
                  <SelectTrigger data-testid="select-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={userForm.status}
                  onValueChange={(value) => setUserForm({ ...userForm, status: value })}
                >
                  <SelectTrigger data-testid="select-user-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={createUserMutation.isPending || updateUserMutation.isPending}
                data-testid="button-submit-user"
              >
                {editingUser ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isPromptDialogOpen} onOpenChange={setIsPromptDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingPrompt ? "Edit Prompt" : "Add New Prompt"}</DialogTitle>
            <DialogDescription>
              {editingPrompt ? "Update prompt configuration." : "Create a new AI prompt template."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePromptSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={promptForm.name}
                  onChange={(e) => setPromptForm({ ...promptForm, name: e.target.value })}
                  required
                  data-testid="input-prompt-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={promptForm.type}
                  onValueChange={(value) => setPromptForm({ ...promptForm, type: value })}
                >
                  <SelectTrigger data-testid="select-prompt-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chat">Chat</SelectItem>
                    <SelectItem value="summary">Summary</SelectItem>
                    <SelectItem value="analysis">Analysis</SelectItem>
                    <SelectItem value="sop">SOP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={promptForm.description}
                onChange={(e) => setPromptForm({ ...promptForm, description: e.target.value })}
                placeholder="Brief description of this prompt..."
                data-testid="input-prompt-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Prompt Content</Label>
              <Textarea
                id="content"
                value={promptForm.content}
                onChange={(e) => setPromptForm({ ...promptForm, content: e.target.value })}
                rows={8}
                required
                placeholder="Enter the AI prompt template..."
                data-testid="input-prompt-content"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="isActive"
                checked={promptForm.isActive}
                onCheckedChange={(checked) => setPromptForm({ ...promptForm, isActive: checked })}
                data-testid="switch-prompt-active"
              />
              <Label htmlFor="isActive">Active</Label>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={createPromptMutation.isPending || updatePromptMutation.isPending}
                data-testid="button-submit-prompt"
              >
                {editingPrompt ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
