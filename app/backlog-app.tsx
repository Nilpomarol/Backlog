"use client";

import { ArrowDown, ArrowUp, Check, Clock3, Filter, LayoutGrid, LockKeyhole, LogIn, LogOut, Menu, Pencil, Plus, Search, Sparkles, ThumbsUp, Trash2, UserPlus, Users, X } from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";

type Language = "ca" | "en";
type Status = "Backlog" | "In progress" | "In review" | "Done" | "Discarded";
type ItemType = "Bug" | "Feature" | "Improvement" | "Task";
type FilterKey = "all" | "mine" | "others" | "internal" | ItemType;
type LocalizedText = Record<Language, string>;
type Profile = { id: string; email: string; name: string; avatarUrl: string | null; role: "admin" | "user" };
type ManagedUser = Profile & { status: "pending" | "linked" };
type Application = { id: string; name: string; icon: string; description?: string; activeItemCount: number };
type Subtask = { id: string; title: string; completed: boolean; position: number };
type SimilarItem = { id: string; title: string; type: string; votes: number };
type Card = {
  id: string; title: LocalizedText; description: string; type: ItemType; status: Status; visibility: "shared" | "internal";
  creatorId: string; creator: string; creatorAvatarUrl: string | null; currentUser: boolean; initials: string; votes: number; voted: boolean; subtasks?: [number, number];
};

const statuses: Status[] = ["Backlog", "In progress", "In review", "Done", "Discarded"];
const statusToApi: Record<Status, string> = { Backlog: "backlog", "In progress": "in_progress", "In review": "in_review", Done: "done", Discarded: "discarded" };
const apiToStatus: Record<string, Status> = { backlog: "Backlog", in_progress: "In progress", in_review: "In review", done: "Done", discarded: "Discarded" };
const typeToApi: Record<ItemType, string> = { Bug: "bug", Feature: "feature", Improvement: "improvement", Task: "task" };
const apiToType: Record<string, ItemType> = { bug: "Bug", feature: "Feature", improvement: "Improvement", task: "Task" };
const typeClass: Record<ItemType, string> = { Bug: "type-bug", Feature: "type-feature", Improvement: "type-improvement", Task: "type-task" };

const copy = {
  ca: {
    apps: "Aplicacions", activity: "Activitat", search: "Cerca", administrator: "Administrador", user: "Membre", openMenu: "Obre el menú",
    primaryNavigation: "Navegació principal", yourApps: "Les teves aplicacions", active: "actives", addApp: "Afegeix una aplicació",
    shapeNext: "Dona forma al que vindrà", votesHelp: "Els vots ajuden a destacar les idees més útils.", applicationBacklog: "Llista de millores de l’aplicació",
    newRequest: "Nova proposta", allRequests: "Totes", createdByMe: "Creades per mi", searchRequests: "Cerca propostes", filterCards: "Filtra les targetes",
    moreFilters: "Més filtres", clearFilters: "Neteja els filtres", cardStatus: "Estat de les targetes", nothingHere: "Encara no hi ha res", closeDialog: "Tanca el diàleg", close: "Tanca",
    title: "Títol", titlePlaceholder: "Què hauria de canviar?", similarHint: "Les propostes semblants apareixeran aquí mentre escrius.", type: "Tipus",
    description: "Descripció", optional: "Opcional", descriptionPlaceholder: "Afegeix una mica més de context…", cancel: "Cancel·la",
    createRequest: "Crea la proposta", internal: "Interna", you: "Tu", createdBy: "Creada per", voted: "Votada", voteForThis: "Vota-la",
    removeVote: "Retira el vot de", voteFor: "Vota", subtasksComplete: "subtasques completades", language: "Idioma", signInTitle: "Entra al teu backlog",
    signInCopy: "Inicia sessió amb un compte convidat per veure i gestionar les propostes reals.", signInGoogle: "Continua amb Google", signOut: "Tanca la sessió",
    loading: "Carregant…", save: "Desa els canvis", delete: "Elimina", editRequest: "Edita la proposta", workflow: "Estat", shared: "Compartida",
    saveError: "No s’han pogut desar els canvis.", deleteConfirm: "Vols eliminar aquesta proposta? Aquesta acció no es pot desfer.", configHelp: "Revisa la configuració i que el teu correu estigui convidat.",
    fromOthers: "D’altres persones", internalFilter: "Internes", subtasks: "Subtasques", addSubtask: "Afegeix una subtasca", noSubtasks: "Encara no hi ha subtasques.",
    possibleDuplicates: "Potser ja existeix", useExisting: "Obre la proposta", moveUp: "Mou amunt", moveDown: "Mou avall", deleteSubtask: "Elimina la subtasca",
    profile: "El teu perfil", displayName: "Nom visible", profileImage: "Enllaç de la imatge de perfil", profileImageHint: "Fes servir una adreça HTTPS o deixa-ho buit per no mostrar cap foto.",
    manageUsers: "Gestiona els usuaris", inviteUser: "Convida una persona", email: "Correu electrònic", name: "Nom", role: "Rol", member: "Membre",
    invitationPending: "Invitació pendent", accountLinked: "Compte vinculat", removeInvitation: "Retira la invitació", invitationSaved: "Invitació desada.",
  },
  en: {
    apps: "Apps", activity: "Activity", search: "Search", administrator: "Administrator", user: "Member", openMenu: "Open menu",
    primaryNavigation: "Primary navigation", yourApps: "Your apps", active: "active", addApp: "Add app", shapeNext: "Shape what’s next",
    votesHelp: "Votes help the most useful ideas rise.", applicationBacklog: "Application backlog", newRequest: "New request", allRequests: "All requests",
    createdByMe: "Created by me", searchRequests: "Search requests", filterCards: "Filter cards", moreFilters: "More filters", clearFilters: "Clear filters", cardStatus: "Card status",
    nothingHere: "Nothing here yet", closeDialog: "Close dialog", close: "Close", title: "Title", titlePlaceholder: "What should change?",
    similarHint: "Similar requests will appear here as you type.", type: "Type", description: "Description", optional: "Optional",
    descriptionPlaceholder: "Add a little more context…", cancel: "Cancel", createRequest: "Create request", internal: "Internal", you: "You",
    createdBy: "Created by", voted: "Voted", voteForThis: "Vote for this", removeVote: "Remove vote from", voteFor: "Vote for",
    subtasksComplete: "subtasks complete", language: "Language", signInTitle: "Sign in to your backlog", signInCopy: "Use an invited account to view and manage real requests.",
    signInGoogle: "Continue with Google", signOut: "Sign out", loading: "Loading…", save: "Save changes", delete: "Delete", editRequest: "Edit request",
    workflow: "Status", shared: "Shared", saveError: "The changes could not be saved.", deleteConfirm: "Delete this request? This cannot be undone.", configHelp: "Check the configuration and confirm that your email is invited.",
    fromOthers: "From others", internalFilter: "Internal", subtasks: "Subtasks", addSubtask: "Add a subtask", noSubtasks: "No subtasks yet.",
    possibleDuplicates: "This may already exist", useExisting: "Open request", moveUp: "Move up", moveDown: "Move down", deleteSubtask: "Delete subtask",
    profile: "Your profile", displayName: "Display name", profileImage: "Profile image link", profileImageHint: "Use an HTTPS address or leave it empty to show no photo.",
    manageUsers: "Manage users", inviteUser: "Invite someone", email: "Email", name: "Name", role: "Role", member: "Member",
    invitationPending: "Invitation pending", accountLinked: "Account linked", removeInvitation: "Remove invitation", invitationSaved: "Invitation saved.",
  },
} as const;

const statusLabels: Record<Language, Record<Status, string>> = {
  ca: { Backlog: "Pendents", "In progress": "En curs", "In review": "En revisió", Done: "Fetes", Discarded: "Descartades" },
  en: { Backlog: "Backlog", "In progress": "In progress", "In review": "In review", Done: "Done", Discarded: "Discarded" },
};
const typeLabels: Record<Language, Record<ItemType, string>> = {
  ca: { Bug: "Error", Feature: "Funcionalitat", Improvement: "Millora", Task: "Tasca" },
  en: { Bug: "Bug", Feature: "Feature", Improvement: "Improvement", Task: "Task" },
};

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?"; }

function Avatar({ name, url, admin = false, large = false }: { name: string; url?: string | null; admin?: boolean; large?: boolean }) {
  return <span className={`avatar ${admin ? "avatar-admin" : ""} ${large ? "avatar-large" : ""}`}>{url ? <>
    {/* Arbitrary user-selected HTTPS avatar hosts cannot use a fixed Next image allowlist. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt="" referrerPolicy="no-referrer" />
  </> : initials(name)}</span>;
}

function BacklogCard({ card, language, draggable, onVote, onOpen }: { card: Card; language: Language; draggable: boolean; onVote: (card: Card) => void; onOpen: (card: Card) => void }) {
  const t = copy[language];
  return (
    <article className="backlog-card" draggable={draggable} onDragStart={(event) => event.dataTransfer.setData("text/backlog-id", card.id)} onClick={() => onOpen(card)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onOpen(card)}>
      <div className="card-flags"><span className={`type-pill ${typeClass[card.type]}`}>{typeLabels[language][card.type]}</span>{card.visibility === "internal" && <span className="internal-pill"><LockKeyhole size={12} /> {t.internal}</span>}</div>
      <h3>{card.title[language]}</h3>
      {card.subtasks && <div className="progress-row" aria-label={`${card.subtasks[0]} de ${card.subtasks[1]} ${t.subtasksComplete}`}><span className="progress-track"><span style={{ width: `${(card.subtasks[0] / card.subtasks[1]) * 100}%` }} /></span><span>{card.subtasks[0]}/{card.subtasks[1]}</span></div>}
      <div className="card-footer"><Avatar name={card.creator} url={card.creatorAvatarUrl} admin={card.currentUser} /><span className="creator-name">{card.currentUser ? t.you : card.creator}</span><button className={`vote-button ${card.voted ? "voted" : ""}`} onClick={(event) => { event.stopPropagation(); onVote(card); }} disabled={card.currentUser} aria-label={`${card.voted ? t.removeVote : t.voteFor} ${card.title[language]}`}><ThumbsUp size={14} fill={card.voted ? "currentColor" : "none"} /> {card.votes}</button></div>
    </article>
  );
}

export function BacklogApp() {
  const [language, setLanguage] = useState<Language>("ca");
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [activeAppId, setActiveAppId] = useState("atlas");
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeStatus, setActiveStatus] = useState<Status>("Backlog");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState<ItemType>("Feature");
  const [formVisibility, setFormVisibility] = useState<"shared" | "internal">("shared");
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [similarItems, setSimilarItems] = useState<SimilarItem[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"user" | "admin">("user");
  const t = copy[language];
  const selectedCard = cards.find((card) => card.id === selectedId) ?? null;
  const activeApplication = applications.find((application) => application.id === activeAppId);

  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => {
    let unsubscribe = () => {};
    void import("../lib/firebase-client").then(({ getFirebaseAuth }) => import("firebase/auth").then(({ onAuthStateChanged }) => {
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
        setFirebaseUser(user); setAuthReady(true);
        if (!user) { setProfile(null); setApplications([]); setCards([]); }
      });
    })).catch((reason: Error) => { setError(reason.message); setAuthReady(true); });
    return () => unsubscribe();
  }, []);

  const apiRequest = useCallback(async (path: string, init?: RequestInit) => {
    if (!firebaseUser) throw new Error("Sign in required.");
    const token = await firebaseUser.getIdToken();
    const response = await fetch(`/api${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init?.headers } });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new Error(payload?.error?.message || `Request failed (${response.status}).`);
    }
    return response.status === 204 ? null : response.json();
  }, [firebaseUser]);

  const loadItems = useCallback(async () => {
    if (!firebaseUser || !activeAppId) return;
    setLoading(true);
    try {
      const payload = await apiRequest(`/apps/${encodeURIComponent(activeAppId)}/items`) as { data: Record<string, unknown>[] };
      setCards(payload.data.map((row) => ({
        id: String(row.id), title: { ca: String(row.title), en: String(row.title) }, description: row.description ? String(row.description) : "",
        type: apiToType[String(row.type)] ?? "Task", status: apiToStatus[String(row.status)] ?? "Backlog",
        visibility: String(row.visibility) === "internal" ? "internal" : "shared", creatorId: String(row.creatorId), creator: String(row.creatorName), creatorAvatarUrl: row.creatorAvatarUrl ? String(row.creatorAvatarUrl) : null,
        currentUser: String(row.creatorId) === profile?.id, initials: initials(String(row.creatorName)), votes: Number(row.votes), voted: Boolean(row.voted),
        subtasks: Number(row.subtaskCount) ? [Number(row.completedSubtasks), Number(row.subtaskCount)] : undefined,
      })));
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.saveError); }
    finally { setLoading(false); }
  }, [activeAppId, apiRequest, firebaseUser, profile?.id, t.saveError]);

  useEffect(() => {
    if (!firebaseUser) return;
    void Promise.resolve().then(() => setLoading(true)).then(() => Promise.all([apiRequest("/me"), apiRequest("/apps")])).then(([mePayload, appsPayload]) => {
      const me = (mePayload as { data: Profile }).data;
      const apps = (appsPayload as { data: Application[] }).data;
      setProfile(me); setApplications(apps); setActiveAppId((current) => apps.some((app) => app.id === current) ? current : apps[0]?.id || ""); setError("");
    }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, [apiRequest, firebaseUser]);

  useEffect(() => { if (profile) void Promise.resolve().then(loadItems); }, [profile, activeAppId, loadItems]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!createOpen || formTitle.trim().length < 3 || !firebaseUser) { setSimilarItems([]); return; }
      void apiRequest(`/apps/${encodeURIComponent(activeAppId)}/items/similar?title=${encodeURIComponent(formTitle)}`)
        .then((payload) => setSimilarItems((payload as { data: SimilarItem[] }).data))
        .catch(() => setSimilarItems([]));
    }, 275);
    return () => window.clearTimeout(timer);
  }, [activeAppId, apiRequest, createOpen, firebaseUser, formTitle]);

  const visibleCards = useMemo(() => cards.filter((card) => {
    const matchesQuery = card.title[language].toLocaleLowerCase(language).includes(query.toLocaleLowerCase(language));
    const matchesFilter = activeFilter === "all"
      || (activeFilter === "mine" && card.currentUser)
      || (activeFilter === "others" && !card.currentUser)
      || (activeFilter === "internal" && card.visibility === "internal")
      || card.type === activeFilter;
    return matchesQuery && matchesFilter;
  }), [cards, query, activeFilter, language]);

  async function signIn() { setError(""); try { const [{ getFirebaseAuth }, { GoogleAuthProvider, signInWithPopup }] = await Promise.all([import("../lib/firebase-client"), import("firebase/auth")]); await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider()); } catch (reason) { setError(reason instanceof Error ? reason.message : t.saveError); } }
  async function signOutUser() { const [{ getFirebaseAuth }, { signOut }] = await Promise.all([import("../lib/firebase-client"), import("firebase/auth")]); await signOut(getFirebaseAuth()); }
  function openProfile() { if (!profile) return; setProfileName(profile.name); setProfileAvatarUrl(profile.avatarUrl ?? ""); setProfileOpen(true); }
  async function saveProfile(event: React.FormEvent) { event.preventDefault(); try { const payload = await apiRequest("/me", { method: "PATCH", body: JSON.stringify({ name: profileName, avatarUrl: profileAvatarUrl.trim() || null }) }) as { data: Profile }; setProfile(payload.data); setProfileOpen(false); await loadItems(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.saveError); } }
  async function loadUsers() { const payload = await apiRequest("/users") as { data: ManagedUser[] }; setManagedUsers(payload.data); }
  function openUsers() { setProfileOpen(false); setUsersOpen(true); setInviteEmail(""); setInviteName(""); setInviteRole("user"); void loadUsers().catch((reason: Error) => setError(reason.message)); }
  async function inviteUser(event: React.FormEvent) { event.preventDefault(); try { await apiRequest("/users/invitations", { method: "POST", body: JSON.stringify({ email: inviteEmail, name: inviteName, role: inviteRole }) }); setInviteEmail(""); setInviteName(""); setInviteRole("user"); await loadUsers(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.saveError); } }
  async function changeUserRole(id: string, role: "user" | "admin") { try { await apiRequest(`/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }); await loadUsers(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.saveError); } }
  async function removeInvitation(id: string) { try { await apiRequest(`/users/${id}/invitation`, { method: "DELETE" }); await loadUsers(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.saveError); } }
  async function toggleVote(card: Card) { try { await apiRequest(`/items/${card.id}/vote`, { method: card.voted ? "DELETE" : "POST" }); await loadItems(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.saveError); } }
  async function moveItem(id: string, status: Status) { if (profile?.role !== "admin") return; try { await apiRequest(`/items/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: statusToApi[status] }) }); await loadItems(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.saveError); } }
  function openCreate() { setFormTitle(""); setFormDescription(""); setFormType("Feature"); setFormVisibility("shared"); setSimilarItems([]); setCreateOpen(true); }
  async function refreshDetail(id: string) {
    const payload = await apiRequest(`/items/${id}`) as { data: { subtasks: Record<string, unknown>[] } };
    setSubtasks(payload.data.subtasks.map((subtask) => ({ id: String(subtask.id), title: String(subtask.title), completed: Boolean(subtask.completed), position: Number(subtask.position) })));
  }
  function openEdit(card: Card) {
    setFormTitle(card.title[language]); setFormDescription(card.description); setFormType(card.type); setFormVisibility(card.visibility); setSelectedId(card.id); setSubtasks([]); setNewSubtask("");
    void refreshDetail(card.id).catch((reason: Error) => setError(reason.message));
  }
  async function createItem(event: React.FormEvent) { event.preventDefault(); try { await apiRequest("/items", { method: "POST", body: JSON.stringify({ appId: activeAppId, title: formTitle, description: formDescription, type: typeToApi[formType], visibility: formVisibility }) }); setCreateOpen(false); await loadItems(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.saveError); } }
  async function saveItem(event: React.FormEvent) { event.preventDefault(); if (!selectedCard) return; try { await apiRequest(`/items/${selectedCard.id}`, { method: "PATCH", body: JSON.stringify({ title: formTitle, description: formDescription, type: typeToApi[formType] }) }); if (profile?.role === "admin" && formVisibility !== selectedCard.visibility) await apiRequest(`/items/${selectedCard.id}/visibility`, { method: "PATCH", body: JSON.stringify({ visibility: formVisibility }) }); setSelectedId(null); await loadItems(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.saveError); } }
  async function deleteItem() { if (!selectedCard || !window.confirm(t.deleteConfirm)) return; try { await apiRequest(`/items/${selectedCard.id}`, { method: "DELETE" }); setSelectedId(null); await loadItems(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.saveError); } }
  async function addSubtask() { if (!selectedCard || !newSubtask.trim()) return; try { await apiRequest(`/items/${selectedCard.id}/subtasks`, { method: "POST", body: JSON.stringify({ title: newSubtask }) }); setNewSubtask(""); await refreshDetail(selectedCard.id); await loadItems(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.saveError); } }
  async function toggleSubtask(subtask: Subtask) { if (!selectedCard) return; try { await apiRequest(`/subtasks/${subtask.id}`, { method: "PATCH", body: JSON.stringify({ completed: !subtask.completed }) }); await refreshDetail(selectedCard.id); await loadItems(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.saveError); } }
  async function deleteSubtask(id: string) { if (!selectedCard) return; try { await apiRequest(`/subtasks/${id}`, { method: "DELETE" }); await refreshDetail(selectedCard.id); await loadItems(); } catch (reason) { setError(reason instanceof Error ? reason.message : t.saveError); } }
  async function reorderSubtask(index: number, direction: -1 | 1) { if (!selectedCard) return; const target = index + direction; if (target < 0 || target >= subtasks.length) return; const reordered = [...subtasks]; [reordered[index], reordered[target]] = [reordered[target], reordered[index]]; setSubtasks(reordered); try { await apiRequest(`/items/${selectedCard.id}/subtasks/order`, { method: "PUT", body: JSON.stringify({ ids: reordered.map((subtask) => subtask.id) }) }); await loadItems(); } catch (reason) { setSubtasks(subtasks); setError(reason instanceof Error ? reason.message : t.saveError); } }
  function openSimilar(id: string) { const card = cards.find((item) => item.id === id); if (!card) return; setCreateOpen(false); openEdit(card); }

  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: t.allRequests }, { key: "mine", label: t.createdByMe }, { key: "others", label: t.fromOthers },
    ...(profile?.role === "admin" ? [{ key: "internal" as const, label: t.internalFilter }] : []),
    ...(["Bug", "Feature", "Improvement", "Task"] as ItemType[]).map((key) => ({ key, label: typeLabels[language][key] })),
  ];

  return (
    <main className="app-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark"><LayoutGrid size={18} /></span><span>Backlog</span></div><nav className="desktop-nav" aria-label={t.primaryNavigation}><a className="nav-active" href="#board">{t.apps}</a></nav><div className="top-actions"><label className="language-picker"><span className="sr-only">{t.language}</span><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t.language}><option value="ca">CA</option><option value="en">EN</option></select></label><button className="icon-button" aria-label={t.search} onClick={() => document.getElementById("request-search")?.focus()}><Search size={18} /></button>{profile && <button className="profile-button" onClick={openProfile}><Avatar name={profile.name} url={profile.avatarUrl} admin /><span className="profile-copy"><strong>{profile.name}</strong><small>{profile.role === "admin" ? t.administrator : t.user}</small></span><Pencil size={14} /></button>}<button className="mobile-menu" aria-label={t.profile} onClick={openProfile}><Menu size={20} /></button></div></header>

      <div className="workspace" id="board"><aside className="app-rail"><div className="rail-label">{t.yourApps}</div>{applications.map((app, index) => <button key={app.id} className={`app-switch ${activeAppId === app.id ? "active" : ""}`} onClick={() => setActiveAppId(app.id)}><span className={`app-icon ${index === 0 ? "atlas-icon" : index === 1 ? "home-icon" : "recipes-icon"}`}>{app.icon}</span><span><strong>{app.name}</strong><small>{app.activeItemCount} {t.active}</small></span></button>)}<button className="add-app" disabled><Plus size={15} /> {t.addApp}</button><div className="rail-note"><Sparkles size={16} /><p><strong>{t.shapeNext}</strong><br />{t.votesHelp}</p></div></aside>

        <section className="content"><div className="page-heading"><div className="app-title-group"><span className="app-icon atlas-icon large">{activeApplication?.icon || "A"}</span><div><span className="eyebrow">{t.applicationBacklog}</span><h1>{activeApplication?.name || "Atlas"}</h1><p>{activeApplication?.description || ""}</p></div></div><button className="primary-button" onClick={openCreate} disabled={!profile}><Plus size={17} /> {t.newRequest}</button></div>
          {error && <div className="error-banner" role="alert">{error} <small>{t.configHelp}</small></div>}
          <div className="toolbar"><div className="filter-chips" aria-label={t.filterCards}>{filters.map((filter) => <button key={filter.key} className={activeFilter === filter.key ? "active" : ""} onClick={() => setActiveFilter(filter.key)}>{filter.label}</button>)}</div><label className="search-field"><Search size={16} /><input id="request-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchRequests} aria-label={t.searchRequests} /></label><button className="filter-icon" aria-label={t.clearFilters} onClick={() => { setActiveFilter("all"); setQuery(""); }}><Filter size={17} /></button></div>
          <div className="mobile-tabs" role="tablist" aria-label={t.cardStatus}>{statuses.map((status) => <button role="tab" aria-selected={activeStatus === status} className={activeStatus === status ? "active" : ""} key={status} onClick={() => setActiveStatus(status)}>{statusLabels[language][status]}<span>{visibleCards.filter((card) => card.status === status).length}</span></button>)}</div>
          <div className="board">{statuses.map((status) => { const statusCards = visibleCards.filter((card) => card.status === status); return <section className={`board-column ${activeStatus === status ? "mobile-active" : ""}`} key={status} onDragOver={(event) => profile?.role === "admin" && event.preventDefault()} onDrop={(event) => void moveItem(event.dataTransfer.getData("text/backlog-id"), status)}><header className="column-header"><span className={`status-dot status-${status.toLowerCase().replace(" ", "-")}`} /><h2>{statusLabels[language][status]}</h2><span className="count">{statusCards.length}</span>{status === "Done" && <Check size={15} />}</header><div className="card-stack">{statusCards.map((card) => <BacklogCard key={card.id} card={card} language={language} draggable={profile?.role === "admin"} onVote={(item) => void toggleVote(item)} onOpen={openEdit} />)}{!loading && statusCards.length === 0 && <div className="empty-column"><Clock3 size={20} /><span>{t.nothingHere}</span></div>}{loading && <div className="empty-column"><Clock3 size={20} /><span>{t.loading}</span></div>}</div></section>; })}</div>
        </section>
      </div>

      {authReady && !firebaseUser && <section className="auth-gate" role="dialog" aria-modal="true"><span className="brand-mark"><LayoutGrid size={20} /></span><h1>{t.signInTitle}</h1><p>{t.signInCopy}</p><button className="primary-button" onClick={() => void signIn()}><LogIn size={18} /> {t.signInGoogle}</button>{error && <small className="auth-error">{error}</small>}</section>}
      {(createOpen || selectedCard || profileOpen || usersOpen) && <button className="dialog-backdrop" aria-label={t.closeDialog} onClick={() => { setCreateOpen(false); setSelectedId(null); setProfileOpen(false); setUsersOpen(false); }} />}

      {createOpen && (
        <section className="side-panel" role="dialog" aria-modal="true" aria-labelledby="create-title">
          <header><div><span className="eyebrow">{activeApplication?.name}</span><h2 id="create-title">{t.newRequest}</h2></div><button className="icon-button" onClick={() => setCreateOpen(false)} aria-label={t.close}><X size={19} /></button></header>
          <form onSubmit={createItem}>
            <label>{t.title}<input autoFocus required minLength={3} value={formTitle} onChange={(event) => setFormTitle(event.target.value)} placeholder={t.titlePlaceholder} /></label>
            <div className="similar-hint"><Sparkles size={16} /><span>{t.similarHint}</span></div>
            {similarItems.length > 0 && <div className="similar-list"><strong>{t.possibleDuplicates}</strong>{similarItems.map((item) => <button type="button" key={item.id} onClick={() => openSimilar(item.id)}><span>{item.title}</span><small>{typeLabels[language][apiToType[item.type] ?? "Task"]} · {item.votes} ♥</small></button>)}</div>}
            <label>{t.type}<select value={formType} onChange={(event) => setFormType(event.target.value as ItemType)}>{(["Bug", "Feature", "Improvement", "Task"] as ItemType[]).map((type) => <option key={type} value={type}>{typeLabels[language][type]}</option>)}</select></label>
            <label>{t.description} <small>{t.optional}</small><textarea value={formDescription} onChange={(event) => setFormDescription(event.target.value)} placeholder={t.descriptionPlaceholder} rows={5} /></label>
            {profile?.role === "admin" && <label>{t.internal}<select value={formVisibility} onChange={(event) => setFormVisibility(event.target.value as "shared" | "internal")}><option value="shared">{t.shared}</option><option value="internal">{t.internal}</option></select></label>}
            <div className="panel-actions"><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>{t.cancel}</button><button className="primary-button">{t.createRequest}</button></div>
          </form>
        </section>
      )}

      {selectedCard && (
        <section className="side-panel detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
          <header><div><span className={`type-pill ${typeClass[selectedCard.type]}`}><Pencil size={12} /> {t.editRequest}</span></div><button className="icon-button" onClick={() => setSelectedId(null)} aria-label={t.close}><X size={19} /></button></header>
          <form onSubmit={saveItem}>
            <label>{t.title}<input required minLength={3} value={formTitle} onChange={(event) => setFormTitle(event.target.value)} disabled={!selectedCard.currentUser && profile?.role !== "admin"} /></label>
            <label>{t.type}<select value={formType} onChange={(event) => setFormType(event.target.value as ItemType)} disabled={!selectedCard.currentUser && profile?.role !== "admin"}>{(["Bug", "Feature", "Improvement", "Task"] as ItemType[]).map((type) => <option key={type} value={type}>{typeLabels[language][type]}</option>)}</select></label>
            <label>{t.description}<textarea rows={5} value={formDescription} onChange={(event) => setFormDescription(event.target.value)} disabled={!selectedCard.currentUser && profile?.role !== "admin"} /></label>
            {profile?.role === "admin" && <><label>{t.workflow}<select value={selectedCard.status} onChange={(event) => void moveItem(selectedCard.id, event.target.value as Status)}>{statuses.map((status) => <option key={status} value={status}>{statusLabels[language][status]}</option>)}</select></label><label>{t.internal}<select value={formVisibility} onChange={(event) => setFormVisibility(event.target.value as "shared" | "internal")}><option value="shared">{t.shared}</option><option value="internal">{t.internal}</option></select></label></>}
            <section className="subtask-section">
              <h3>{t.subtasks} <span>{subtasks.filter((item) => item.completed).length}/{subtasks.length}</span></h3>
              {subtasks.length === 0 && <p>{t.noSubtasks}</p>}
              <div className="subtask-list">{subtasks.map((subtask, index) => <div className="subtask-row" key={subtask.id}><input type="checkbox" checked={subtask.completed} onChange={() => void toggleSubtask(subtask)} disabled={!selectedCard.currentUser && profile?.role !== "admin"} aria-label={subtask.title} /><span className={subtask.completed ? "completed" : ""}>{subtask.title}</span>{(selectedCard.currentUser || profile?.role === "admin") && <span className="subtask-actions"><button type="button" onClick={() => void reorderSubtask(index, -1)} disabled={index === 0} aria-label={t.moveUp}><ArrowUp size={13} /></button><button type="button" onClick={() => void reorderSubtask(index, 1)} disabled={index === subtasks.length - 1} aria-label={t.moveDown}><ArrowDown size={13} /></button><button type="button" onClick={() => void deleteSubtask(subtask.id)} aria-label={t.deleteSubtask}><Trash2 size={13} /></button></span>}</div>)}</div>
              {(selectedCard.currentUser || profile?.role === "admin") && <div className="subtask-add"><input value={newSubtask} onChange={(event) => setNewSubtask(event.target.value)} placeholder={t.addSubtask} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addSubtask(); } }} /><button type="button" className="secondary-button" onClick={() => void addSubtask()} disabled={!newSubtask.trim()}><Plus size={15} /></button></div>}
            </section>
            <div className="detail-meta"><Avatar name={selectedCard.creator} url={selectedCard.creatorAvatarUrl} /><span>{t.createdBy} <strong>{selectedCard.currentUser ? t.you : selectedCard.creator}</strong></span></div>
            <button type="button" className={`detail-vote ${selectedCard.voted ? "voted" : ""}`} onClick={() => void toggleVote(selectedCard)} disabled={selectedCard.currentUser}><ThumbsUp size={17} fill={selectedCard.voted ? "currentColor" : "none"} />{selectedCard.voted ? t.voted : t.voteForThis}<span>{selectedCard.votes}</span></button>
            {(selectedCard.currentUser || profile?.role === "admin") && <div className="panel-actions"><button type="button" className="danger-button" onClick={() => void deleteItem()}><Trash2 size={15} /> {t.delete}</button><button className="primary-button">{t.save}</button></div>}
          </form>
        </section>
      )}

      {profileOpen && profile && (
        <section className="side-panel profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title">
          <header><div><span className="eyebrow">{profile.email}</span><h2 id="profile-title">{t.profile}</h2></div><button className="icon-button" onClick={() => setProfileOpen(false)} aria-label={t.close}><X size={19} /></button></header>
          <form onSubmit={saveProfile}>
            <div className="profile-preview"><Avatar name={profileName || profile.name} url={profileAvatarUrl} admin={profile.role === "admin"} large /><span><strong>{profileName || profile.name}</strong><small>{profile.role === "admin" ? t.administrator : t.member}</small></span></div>
            <label>{t.displayName}<input required minLength={2} maxLength={80} value={profileName} onChange={(event) => setProfileName(event.target.value)} /></label>
            <label>{t.profileImage}<input type="url" value={profileAvatarUrl} onChange={(event) => setProfileAvatarUrl(event.target.value)} placeholder="https://…" /><small>{t.profileImageHint}</small></label>
            <div className="panel-actions"><button type="button" className="secondary-button" onClick={() => void signOutUser()}><LogOut size={15} /> {t.signOut}</button>{profile.role === "admin" && <button type="button" className="secondary-button" onClick={openUsers}><Users size={15} /> {t.manageUsers}</button>}<button className="primary-button">{t.save}</button></div>
          </form>
        </section>
      )}

      {usersOpen && profile?.role === "admin" && (
        <section className="side-panel users-panel" role="dialog" aria-modal="true" aria-labelledby="users-title">
          <header><div><span className="eyebrow">{t.administrator}</span><h2 id="users-title">{t.manageUsers}</h2></div><button className="icon-button" onClick={() => setUsersOpen(false)} aria-label={t.close}><X size={19} /></button></header>
          <form className="invite-form" onSubmit={inviteUser}>
            <h3><UserPlus size={16} /> {t.inviteUser}</h3>
            <label>{t.email}<input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /></label>
            <label>{t.name}<input required minLength={2} value={inviteName} onChange={(event) => setInviteName(event.target.value)} /></label>
            <label>{t.role}<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "user" | "admin")}><option value="user">{t.member}</option><option value="admin">{t.administrator}</option></select></label>
            <button className="primary-button"><UserPlus size={15} /> {t.inviteUser}</button>
          </form>
          <div className="user-list">{managedUsers.map((user) => <article className="user-row" key={user.id}><Avatar name={user.name} url={user.avatarUrl} admin={user.role === "admin"} /><span className="user-copy"><strong>{user.name}</strong><small>{user.email}</small><em>{user.status === "linked" ? t.accountLinked : t.invitationPending}</em></span><select value={user.role} onChange={(event) => void changeUserRole(user.id, event.target.value as "user" | "admin")} disabled={user.id === profile.id} aria-label={`${t.role}: ${user.name}`}><option value="user">{t.member}</option><option value="admin">{t.administrator}</option></select>{user.status === "pending" && user.id !== profile.id && <button className="icon-button danger-icon" onClick={() => void removeInvitation(user.id)} aria-label={t.removeInvitation}><Trash2 size={15} /></button>}</article>)}</div>
        </section>
      )}
    </main>
  );
}
