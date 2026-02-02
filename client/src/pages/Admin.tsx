import { useState } from "react";
import { Link, useLocation } from "wouter";
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
  History,
  RotateCcw,
  Clock,
  Bot,
  Sparkles,
  FileText,
  GitBranch,
  Mic,
  Brain,
  LogOut,
  User,
  Zap,
  Link2,
  Copy,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
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

type Tab = "users" | "prompts" | "agents" | "api-test";

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

interface PromptVersion {
  id: string;
  promptId: string;
  version: string;
  name: string;
  type: string;
  content: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ApiKey {
  id: string;
  name: string;
  key?: string; // Only available on creation
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
  type: string;
  description: string | null;
  capabilities: string[] | null;
  icon: string | null;
  promptId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  prompt?: Prompt | null;
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

async function fetchPromptVersions(promptId: string): Promise<PromptVersion[]> {
  const res = await fetch(`/api/admin/prompts/${promptId}/versions`);
  if (!res.ok) throw new Error("Failed to fetch prompt versions");
  return res.json();
}

async function fetchAgents(search?: string, type?: string): Promise<Agent[]> {
  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (type) params.append("type", type);
  const queryString = params.toString();
  const url = queryString ? `/api/admin/agents?${queryString}` : "/api/admin/agents";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch agents");
  return res.json();
}

const AGENT_ICONS: Record<string, typeof Bot> = {
  Bot,
  Sparkles,
  FileText,
  GitBranch,
  Mic,
  Brain,
};

const AGENT_TYPES = [
  { value: "sop", label: "SOP Builder" },
  { value: "flowchart", label: "Flowchart" },
  { value: "analysis", label: "Analysis" },
  { value: "transcription", label: "Transcription" },
  { value: "assistant", label: "Assistant" },
];

async function fetchCurrentUser(email: string): Promise<User | null> {
  try {
    const res = await fetch(`/api/admin/users/by-email/${encodeURIComponent(email)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default function Admin() {
  const { user: firebaseUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("agents");
  const [searchQuery, setSearchQuery] = useState("");
  const [promptTypeFilter, setPromptTypeFilter] = useState<string>("");
  const [agentTypeFilter, setAgentTypeFilter] = useState<string>("");
  const [agentSearchQuery, setAgentSearchQuery] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current user's role from database
  const { data: currentUser } = useQuery({
    queryKey: ["current-user", firebaseUser?.email],
    queryFn: () => fetchCurrentUser(firebaseUser!.email!),
    enabled: !!firebaseUser?.email,
  });

  const isAdmin = currentUser?.role === "admin";

  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [historyPromptId, setHistoryPromptId] = useState<string | null>(null);

  const [userForm, setUserForm] = useState({ username: "", email: "", password: "", role: "user", status: "active" });
  const [promptForm, setPromptForm] = useState({ name: "", type: "chat", content: "", description: "", isActive: true });
  const [agentForm, setAgentForm] = useState({ name: "", type: "sop", description: "", capabilities: "", icon: "Bot", status: "active", promptId: "" });

  // API Test state
  const [testMeetingTitle, setTestMeetingTitle] = useState("Test SOP Meeting");
  const [generatedMeetingLink, setGeneratedMeetingLink] = useState<string | null>(null);
  const [generatedMeetingId, setGeneratedMeetingId] = useState<string | null>(null);

  // API Key state
  const [newKeyName, setNewKeyName] = useState("");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<ApiKey | null>(null);
  const [testApiKey, setTestApiKey] = useState("");

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

  const { data: promptVersions = [], isLoading: versionsLoading } = useQuery({
    queryKey: ["prompt-versions", historyPromptId],
    queryFn: () => fetchPromptVersions(historyPromptId!),
    enabled: !!historyPromptId && isHistoryDialogOpen,
  });

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ["admin-agents", agentSearchQuery, agentTypeFilter],
    queryFn: () => fetchAgents(agentSearchQuery || undefined, agentTypeFilter || undefined),
    enabled: activeTab === "agents",
  });

  const { data: allPrompts = [] } = useQuery({
    queryKey: ["all-prompts-for-agents"],
    queryFn: () => fetchPrompts(),
  });

  const { data: apiKeys = [], isLoading: apiKeysLoading } = useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await fetch("/api/admin/api-keys");
      if (!res.ok) throw new Error("Failed to fetch API keys");
      return res.json();
    },
    enabled: activeTab === "api-test",
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

  const revertPromptMutation = useMutation({
    mutationFn: async ({ promptId, versionId }: { promptId: string; versionId: string }) => {
      const res = await fetch(`/api/admin/prompts/${promptId}/revert/${versionId}`, {
        method: "POST",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to revert prompt");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-prompts"] });
      queryClient.invalidateQueries({ queryKey: ["prompt-versions"] });
      setIsHistoryDialogOpen(false);
      toast({ title: "Prompt reverted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createAgentMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; description: string; capabilities: string[]; icon: string; status: string }) => {
      const res = await fetch("/api/admin/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create agent");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-agents"] });
      setIsAgentDialogOpen(false);
      resetAgentForm();
      toast({ title: "Agent created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateAgentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ name: string; type: string; description: string; capabilities: string[]; icon: string; status: string }> }) => {
      const res = await fetch(`/api/admin/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update agent");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-agents"] });
      setIsAgentDialogOpen(false);
      setEditingAgent(null);
      resetAgentForm();
      toast({ title: "Agent updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/agents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete agent");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-agents"] });
      toast({ title: "Agent deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete agent", variant: "destructive" });
    },
  });

  // API Test mutation for creating instant meetings
  const createTestMeetingMutation = useMutation({
    mutationFn: async (title: string) => {
      // Use testApiKey (which can be set from newlyCreatedKey or manually entered)
      const apiKeyToUse = testApiKey || newlyCreatedKey?.key;
      if (!apiKeyToUse) {
        throw new Error("Please enter an API key or create a new one first");
      }
      
      const headers: Record<string, string> = { 
        "Content-Type": "application/json",
        "X-API-Key": apiKeyToUse
      };
      
      const res = await fetch("/api/external/create-meeting", {
        method: "POST",
        headers,
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create meeting");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedMeetingLink(data.link);
      setGeneratedMeetingId(data.meeting.id);
      toast({ title: "Meeting created successfully", description: "Click the link to join the meeting with SOP generation enabled." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create API key");
      }
      return res.json();
    },
    onSuccess: (data: ApiKey) => {
      setNewlyCreatedKey(data);
      setNewKeyName("");
      if (data.key) {
        setTestApiKey(data.key);
      }
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API key created", description: "Copy your key now - it won't be shown again!" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const revokeApiKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke API key");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API key revoked" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetUserForm = () => {
    setUserForm({ username: "", email: "", password: "", role: "user", status: "active" });
  };

  const resetPromptForm = () => {
    setPromptForm({ name: "", type: "chat", content: "", description: "", isActive: true });
  };

  const resetAgentForm = () => {
    setAgentForm({ name: "", type: "sop", description: "", capabilities: "", icon: "Bot", status: "active", promptId: "" });
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

  const openHistoryDialog = (prompt: Prompt) => {
    setHistoryPromptId(prompt.id);
    setEditingPrompt(prompt);
    setIsHistoryDialogOpen(true);
  };

  const openEditAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setAgentForm({
      name: agent.name,
      type: agent.type,
      description: agent.description || "",
      capabilities: agent.capabilities?.join(", ") || "",
      icon: agent.icon || "Bot",
      status: agent.status,
      promptId: agent.promptId || "",
    });
    setIsAgentDialogOpen(true);
  };

  const handleAgentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const capabilities = agentForm.capabilities
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    
    const agentData = {
      name: agentForm.name,
      type: agentForm.type,
      description: agentForm.description,
      capabilities,
      icon: agentForm.icon,
      status: agentForm.status,
      promptId: agentForm.promptId || null,
    };
    
    if (editingAgent) {
      updateAgentMutation.mutate({ id: editingAgent.id, data: agentData });
    } else {
      createAgentMutation.mutate(agentData);
    }
  };

  const getAgentIcon = (iconName: string | null) => {
    const IconComponent = AGENT_ICONS[iconName || "Bot"] || Bot;
    return IconComponent;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
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
    
    const cleanContent = promptForm.content.replace(/<[^>]*>/g, '').trim();
    if (!cleanContent) {
      toast({ title: "Error", description: "Prompt content cannot be empty", variant: "destructive" });
      return;
    }
    
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
          {firebaseUser?.photoURL ? (
            <img 
              src={firebaseUser.photoURL} 
              alt={firebaseUser.displayName || "User"} 
              className="w-8 h-8 rounded-full object-cover ml-2"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent border border-white/10 flex items-center justify-center ml-2">
              <User className="w-4 h-4 text-white" />
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-8">
        <div className="flex gap-4 mb-6 border-b border-border">
          <button
            onClick={() => setActiveTab("agents")}
            className={`pb-4 px-2 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "agents"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-agents"
          >
            <Bot className="w-4 h-4" />
            Agents
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
            onClick={() => setActiveTab("api-test")}
            className={`pb-4 px-2 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "api-test"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-api-test"
          >
            <Zap className="w-4 h-4" />
            API Test
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
              {isAdmin && (
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
              )}
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
                                onClick={() => openHistoryDialog(prompt)}
                                data-testid={`button-history-prompt-${prompt.id}`}
                                title="View history"
                              >
                                <History className="w-4 h-4" />
                              </Button>
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
                            onClick={() => openHistoryDialog(prompt)}
                            data-testid={`button-history-prompt-mobile-${prompt.id}`}
                          >
                            <History className="w-4 h-4" />
                          </Button>
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

        {activeTab === "agents" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <div className="flex flex-col sm:flex-row gap-4 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search agents..."
                    value={agentSearchQuery}
                    onChange={(e) => setAgentSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-agents"
                  />
                </div>
                <Select value={agentTypeFilter || "all"} onValueChange={(val) => setAgentTypeFilter(val === "all" ? "" : val)}>
                  <SelectTrigger className="w-[180px]" data-testid="select-agent-type-filter">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {AGENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => {
                  setEditingAgent(null);
                  resetAgentForm();
                  setIsAgentDialogOpen(true);
                }}
                data-testid="button-add-agent"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Agent
              </Button>
            </div>

            {agentsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : agents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No agents found</div>
            ) : (
              <>
                <div className="hidden md:block border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Prompt</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Capabilities</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agents.map((agent) => {
                        const IconComponent = getAgentIcon(agent.icon);
                        return (
                          <TableRow key={agent.id} data-testid={`row-agent-${agent.id}`}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                  <IconComponent className="w-4 h-4 text-primary" />
                                </div>
                                <span className="font-medium">{agent.name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {AGENT_TYPES.find((t) => t.value === agent.type)?.label || agent.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {agent.prompt ? (
                                <Badge variant="secondary" className="text-xs">
                                  {agent.prompt.name}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">Not linked</span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {agent.description || "-"}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {(agent.capabilities || []).slice(0, 2).map((cap, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">{cap}</Badge>
                                ))}
                                {(agent.capabilities || []).length > 2 && (
                                  <Badge variant="secondary" className="text-xs">+{(agent.capabilities || []).length - 2}</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={agent.status === "active" ? "default" : "secondary"}>
                                {agent.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditAgent(agent)}
                                  data-testid={`button-edit-agent-${agent.id}`}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteAgentMutation.mutate(agent.id)}
                                  data-testid={`button-delete-agent-${agent.id}`}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="md:hidden space-y-3">
                  {agents.map((agent) => {
                    const IconComponent = getAgentIcon(agent.icon);
                    return (
                      <div
                        key={agent.id}
                        className="border rounded-lg p-4 space-y-3"
                        data-testid={`card-agent-${agent.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg">
                              <IconComponent className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{agent.name}</p>
                              <p className="text-sm text-muted-foreground truncate">
                                {agent.description || "No description"}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditAgent(agent)}
                              data-testid={`button-edit-agent-mobile-${agent.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteAgentMutation.mutate(agent.id)}
                              data-testid={`button-delete-agent-mobile-${agent.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="outline">
                            {AGENT_TYPES.find((t) => t.value === agent.type)?.label || agent.type}
                          </Badge>
                          <Badge variant={agent.status === "active" ? "default" : "secondary"}>
                            {agent.status}
                          </Badge>
                        </div>
                        {(agent.capabilities || []).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {agent.capabilities!.map((cap, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{cap}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "api-test" && (
          <div className="space-y-6">
            <div className="max-w-3xl">
              <h2 className="text-xl font-semibold mb-2">API Keys & Testing</h2>
              <p className="text-muted-foreground mb-6">
                Manage API keys for external systems to create instant meetings with SOP generation enabled.
              </p>

              {/* API Keys Section */}
              <div className="bg-card border rounded-lg p-6 space-y-6 mb-6">
                <h3 className="font-medium text-lg">API Keys</h3>
                
                {/* Create new key */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Key name (e.g., Production, Integration)"
                    className="flex-1"
                    data-testid="input-new-key-name"
                  />
                  <Button
                    onClick={() => createApiKeyMutation.mutate(newKeyName)}
                    disabled={!newKeyName.trim() || createApiKeyMutation.isPending}
                    data-testid="button-create-api-key"
                  >
                    {createApiKeyMutation.isPending ? "Creating..." : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Generate Key
                      </>
                    )}
                  </Button>
                </div>

                {/* Newly created key warning */}
                {newlyCreatedKey && (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                      <Zap className="w-5 h-5" />
                      <span className="font-medium">New API Key Created - Copy Now!</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      This is the only time you'll see the full key. Store it securely.
                    </p>
                    <div className="flex items-center gap-2">
                      <Input 
                        value={newlyCreatedKey.key || ""} 
                        readOnly 
                        className="font-mono text-sm"
                        data-testid="input-new-api-key"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(newlyCreatedKey.key || "");
                          toast({ title: "Copied!", description: "API key copied to clipboard" });
                        }}
                        data-testid="button-copy-new-api-key"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setNewlyCreatedKey(null)}
                    >
                      Dismiss
                    </Button>
                  </div>
                )}

                {/* API Keys list */}
                {apiKeysLoading ? (
                  <div className="text-center py-4 text-muted-foreground">Loading...</div>
                ) : apiKeys.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    No API keys yet. Create one to get started.
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Key</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Last Used</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {apiKeys.map((apiKey) => (
                          <TableRow key={apiKey.id} data-testid={`row-api-key-${apiKey.id}`}>
                            <TableCell className="font-medium">{apiKey.name}</TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {apiKey.keyPrefix}
                            </TableCell>
                            <TableCell>
                              <Badge variant={apiKey.isActive ? "default" : "secondary"}>
                                {apiKey.isActive ? "Active" : "Revoked"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleDateString() : "Never"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(apiKey.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              {apiKey.isActive && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => revokeApiKeyMutation.mutate(apiKey.id)}
                                  disabled={revokeApiKeyMutation.isPending}
                                  className="text-destructive hover:text-destructive"
                                  data-testid={`button-revoke-api-key-${apiKey.id}`}
                                >
                                  <X className="w-4 h-4 mr-1" />
                                  Revoke
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Test Meeting Section */}
              <div className="bg-card border rounded-lg p-6 space-y-6 mb-6">
                <h3 className="font-medium text-lg">Test API</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="test-api-key">API Key</Label>
                  <Input
                    id="test-api-key"
                    type="password"
                    value={testApiKey}
                    onChange={(e) => setTestApiKey(e.target.value)}
                    placeholder="Enter your API key (sk_...)"
                    data-testid="input-test-api-key"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter an API key from above, or create a new one to auto-fill this field.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="meeting-title">Meeting Title</Label>
                  <Input
                    id="meeting-title"
                    value={testMeetingTitle}
                    onChange={(e) => setTestMeetingTitle(e.target.value)}
                    placeholder="Enter meeting title..."
                    data-testid="input-test-meeting-title"
                  />
                </div>

                <Button 
                  onClick={() => createTestMeetingMutation.mutate(testMeetingTitle)}
                  disabled={createTestMeetingMutation.isPending || !testApiKey}
                  className="w-full sm:w-auto"
                  data-testid="button-create-test-meeting"
                >
                  {createTestMeetingMutation.isPending ? (
                    <>Creating...</>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Create Instant Meeting
                    </>
                  )}
                </Button>

                {!testApiKey && (
                  <p className="text-sm text-muted-foreground">
                    Enter an API key or create a new one above to test the external API.
                  </p>
                )}

                {generatedMeetingLink && (
                  <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-4">
                    <div className="flex items-center gap-2 text-primary">
                      <Link2 className="w-5 h-5" />
                      <span className="font-medium">Meeting Created Successfully!</span>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Meeting Link</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          value={generatedMeetingLink} 
                          readOnly 
                          className="font-mono text-sm"
                          data-testid="input-generated-meeting-link"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            navigator.clipboard.writeText(generatedMeetingLink);
                            toast({ title: "Copied!", description: "Meeting link copied to clipboard" });
                          }}
                          data-testid="button-copy-meeting-link"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => window.open(generatedMeetingLink, "_blank")}
                          data-testid="button-open-meeting-link"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      This meeting has the SOP Generator automatically enabled. Share this link with participants 
                      to start a video call with AI-powered SOP generation.
                    </p>
                  </div>
                )}
              </div>

              {/* API Documentation */}
              <div className="bg-card border rounded-lg p-6 space-y-6">
                <h3 className="font-medium text-lg">API Documentation</h3>
                <div className="bg-muted rounded-lg p-4 space-y-4">
                  <div>
                    <span className="text-sm font-mono bg-background px-2 py-1 rounded">POST /api/external/create-meeting</span>
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-2 font-medium">curl example:</p>
                    <pre className="bg-background p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">
{`curl -X POST \\
  "${window.location.origin}/api/external/create-meeting" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{"title": "SOP Draft Session"}'`}
                    </pre>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <p className="mb-2">Request headers:</p>
                    <pre className="bg-background p-3 rounded text-xs overflow-x-auto">
{`Content-Type: application/json
X-API-Key: YOUR_API_KEY`}
                    </pre>
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-2">Request body (optional):</p>
                    <pre className="bg-background p-3 rounded text-xs overflow-x-auto">
{`{
  "title": "Meeting Title",
  "scheduledDate": "2026-01-30T14:00:00.000Z"
}`}
                    </pre>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-2">Response:</p>
                    <pre className="bg-background p-3 rounded text-xs overflow-x-auto">
{`{
  "success": true,
  "meeting": { "id", "title", "roomId", "status", ... },
  "link": "https://your-domain/meeting/abc-defg-hij"
}`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
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
              <RichTextEditor
                value={promptForm.content}
                onChange={(value) => setPromptForm({ ...promptForm, content: value })}
                placeholder="Enter the AI prompt template..."
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
            <DialogFooter className="flex-col sm:flex-row gap-2">
              {editingPrompt && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setHistoryPromptId(editingPrompt.id);
                    setIsPromptDialogOpen(false);
                    setIsHistoryDialogOpen(true);
                  }}
                  className="w-full sm:w-auto sm:mr-auto"
                  data-testid="button-view-history"
                >
                  <History className="w-4 h-4 mr-2" />
                  View History
                </Button>
              )}
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

      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Version History
            </DialogTitle>
            <DialogDescription>
              {editingPrompt ? `View and restore previous versions of "${editingPrompt.name}"` : "Version history"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 py-4">
            {versionsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading versions...</div>
            ) : promptVersions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p>No version history yet</p>
                <p className="text-sm mt-1">Versions are created when you edit a prompt</p>
              </div>
            ) : (
              promptVersions.map((version) => (
                <div
                  key={version.id}
                  className="border rounded-lg p-4 space-y-3"
                  data-testid={`version-${version.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">v{version.version}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(version.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm font-medium mt-2">{version.name}</p>
                      {version.description && (
                        <p className="text-sm text-muted-foreground">{version.description}</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => revertPromptMutation.mutate({ 
                        promptId: version.promptId, 
                        versionId: version.id 
                      })}
                      disabled={revertPromptMutation.isPending}
                      data-testid={`button-revert-${version.id}`}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Restore
                    </Button>
                  </div>
                  <details className="cursor-pointer">
                    <summary className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      View content
                    </summary>
                    <div 
                      className="mt-2 p-3 bg-muted/50 rounded text-sm prose prose-invert prose-sm max-w-none max-h-[200px] overflow-y-auto"
                      dangerouslySetInnerHTML={{ __html: version.content }}
                    />
                  </details>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAgentDialogOpen} onOpenChange={setIsAgentDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAgent ? "Edit Agent" : "Add New Agent"}</DialogTitle>
            <DialogDescription>
              {editingAgent ? "Update agent configuration." : "Create a new AI agent."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAgentSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Name</Label>
              <Input
                id="agent-name"
                value={agentForm.name}
                onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                required
                placeholder="e.g., EVA SOP Assistant"
                data-testid="input-agent-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agent-type">Type</Label>
                <Select
                  value={agentForm.type}
                  onValueChange={(value) => setAgentForm({ ...agentForm, type: value })}
                >
                  <SelectTrigger data-testid="select-agent-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-icon">Icon</Label>
                <Select
                  value={agentForm.icon}
                  onValueChange={(value) => setAgentForm({ ...agentForm, icon: value })}
                >
                  <SelectTrigger data-testid="select-agent-icon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(AGENT_ICONS).map((iconName) => {
                      const IconComp = AGENT_ICONS[iconName];
                      return (
                        <SelectItem key={iconName} value={iconName}>
                          <div className="flex items-center gap-2">
                            <IconComp className="w-4 h-4" />
                            {iconName}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-description">Description</Label>
              <Input
                id="agent-description"
                value={agentForm.description}
                onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })}
                placeholder="Brief description of what this agent does..."
                data-testid="input-agent-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-capabilities">Capabilities</Label>
              <Input
                id="agent-capabilities"
                value={agentForm.capabilities}
                onChange={(e) => setAgentForm({ ...agentForm, capabilities: e.target.value })}
                placeholder="Comma-separated: Screen analysis, SOP generation, ..."
                data-testid="input-agent-capabilities"
              />
              <p className="text-xs text-muted-foreground">Enter capabilities separated by commas</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-status">Status</Label>
              <Select
                value={agentForm.status}
                onValueChange={(value) => setAgentForm({ ...agentForm, status: value })}
              >
                <SelectTrigger data-testid="select-agent-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-prompt">Linked Prompt</Label>
              <Select
                value={agentForm.promptId || "_none"}
                onValueChange={(value) => setAgentForm({ ...agentForm, promptId: value === "_none" ? "" : value })}
              >
                <SelectTrigger data-testid="select-agent-prompt">
                  <SelectValue placeholder="Select a prompt..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No prompt linked</SelectItem>
                  {allPrompts.filter(p => p.isActive).map((prompt) => (
                    <SelectItem key={prompt.id} value={prompt.id}>
                      {prompt.name} ({prompt.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Select an active prompt to control this agent's behavior</p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={createAgentMutation.isPending || updateAgentMutation.isPending}
                data-testid="button-submit-agent"
              >
                {editingAgent ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
